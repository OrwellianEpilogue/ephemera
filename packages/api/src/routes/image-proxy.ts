import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "../utils/logger.js";
import { getErrorMessage } from "@ephemera/shared";

const app = new OpenAPIHono();

// Simple semaphore to limit concurrent image fetches
class Semaphore {
  private permits: number;
  private maxPermits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
    this.maxPermits = permits;
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

  // Check if we can acquire without waiting
  canAcquire(): boolean {
    return this.permits > 0;
  }

  // Get queue size
  queueSize(): number {
    return this.queue.length;
  }
}

// Limit concurrent image fetches to AA (prevent overwhelming their server)
const imageFetchSemaphore = new Semaphore(3);

const imageProxyRoute = createRoute({
  method: "get",
  path: "/proxy/image",
  tags: ["Image Proxy"],
  summary: "Proxy images from AA",
  description:
    "Fetches images from AA through the backend to protect client IP addresses",
  request: {
    query: z.object({
      url: z.string().describe("Base64-encoded image URL to proxy"),
    }),
  },
  responses: {
    200: {
      description: "Image successfully proxied",
      content: {
        "image/*": {
          schema: {
            type: "string",
            format: "binary",
          },
        },
      },
    },
    400: {
      description: "Invalid request - missing or invalid URL parameter",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            details: z.string().optional(),
          }),
        },
      },
    },
    500: {
      description: "Failed to fetch image from source",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            details: z.string().optional(),
          }),
        },
      },
    },
  },
});

app.openapi(imageProxyRoute, async (c) => {
  try {
    const { url: encodedUrl } = c.req.valid("query");

    // Decode the base64-encoded URL
    let imageUrl: string;
    try {
      imageUrl = Buffer.from(encodedUrl, "base64").toString("utf-8");
    } catch (_decodeError) {
      logger.warn("Failed to decode image URL:", encodedUrl);
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
      logger.warn("Invalid URL after decoding:", imageUrl);
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
          "Cache-Control": "no-cache", // Don't cache placeholder
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
        imageFetchSemaphore.release(); // Release before returning
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
      imageFetchSemaphore.release(); // Release on error

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

      throw fetchError; // Re-throw non-timeout errors
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

export default app;
