import { serve } from "@hono/node-server";
import { Hono } from "hono";
import dotenv from "dotenv";
import { getErrorMessage } from "@ephemera/shared";

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || "3223");
const app = new Hono();

// Simple logger
const logger = {
  info: (msg: string) =>
    console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toISOString()} ${msg}`),
  warn: (msg: string) =>
    console.log(`\x1b[33m[WARN]\x1b[0m ${new Date().toISOString()} ${msg}`),
  error: (msg: string, error?: unknown) =>
    console.log(
      `\x1b[31m[ERROR]\x1b[0m ${new Date().toISOString()} ${msg}`,
      error || "",
    ),
};

// Simple semaphore to limit concurrent image fetches
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const resolve = this.queue.shift();
    if (resolve) {
      this.permits--;
      resolve();
    }
  }

  queueSize(): number {
    return this.queue.length;
  }
}

// Limit concurrent image fetches to AA (prevent overwhelming their server)
const imageFetchSemaphore = new Semaphore(3);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "image-proxy" });
});

// Image proxy endpoint
app.get("/api/proxy", async (c) => {
  try {
    const encodedUrl = c.req.query("url");

    if (!encodedUrl) {
      return c.json({ error: "Missing url parameter" }, 400);
    }

    // Decode the base64-encoded URL
    let imageUrl: string;
    try {
      imageUrl = Buffer.from(encodedUrl, "base64").toString("utf-8");
    } catch (_decodeError) {
      logger.warn(`Failed to decode image URL: ${encodedUrl}`);
      return c.json(
        {
          error: "Invalid URL encoding",
          details: "The provided URL parameter is not valid base64",
        },
        400,
      );
    }

    // Validate that we got a proper URL
    try {
      new URL(imageUrl);
    } catch (_urlError) {
      logger.warn(`Invalid URL after decoding: ${imageUrl}`);
      return c.json(
        {
          error: "Invalid URL",
          details: "The decoded URL is not a valid URL",
        },
        400,
      );
    }

    // Fail fast if queue is getting large - return placeholder instead of blocking connection
    const queueSize = imageFetchSemaphore.queueSize();
    if (queueSize >= 10) {
      logger.warn(
        `Image proxy queue full (${queueSize} waiting), returning placeholder`,
      );
      // Return a 1x1 transparent PNG placeholder immediately
      const transparentPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      return new Response(transparentPng, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Acquire semaphore to limit concurrent fetches
    await imageFetchSemaphore.acquire();

    // Fetch the image from AA with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
        );
        imageFetchSemaphore.release();
        return c.json(
          {
            error: "Failed to fetch image",
            details: `Source returned ${response.status}: ${response.statusText}`,
          },
          500,
        );
      }

      // Get the content type from the response
      const contentType = response.headers.get("content-type") || "image/jpeg";

      // Release semaphore after successful fetch
      imageFetchSemaphore.release();

      // Stream the image back to the client
      return new Response(response.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000", // Cache for 1 year
        },
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      imageFetchSemaphore.release();

      // Handle timeout
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        logger.warn(`Image fetch timeout: ${imageUrl}`);
        return c.json(
          {
            error: "Image fetch timeout",
            details: "Failed to fetch image within 5 seconds",
          },
          504,
        );
      }

      throw fetchError;
    }
  } catch (error: unknown) {
    logger.error("Image proxy error:", error);
    return c.json(
      {
        error: "Failed to proxy image",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Start server
serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (_info) => {
    logger.info(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║       Image Proxy Server is running!              ║
║                                                   ║
║   Health:  http://0.0.0.0:${PORT}/health       ║
║   Proxy:   http://0.0.0.0:${PORT}/api/proxy  ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`);
  },
);
