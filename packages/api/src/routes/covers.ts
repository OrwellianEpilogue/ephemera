import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { readFile, access } from "fs/promises";
import { join, extname } from "path";
import { coverDownloader } from "../services/cover-downloader.js";
import { logger } from "../utils/logger.js";
import { errorResponseSchema } from "@ephemera/shared";

const app = new OpenAPIHono();

// Content type mapping for image extensions
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Get cover image route
const getCoverRoute = createRoute({
  method: "get",
  path: "/covers/{filename}",
  tags: ["Covers"],
  summary: "Get a locally stored cover image",
  description:
    "Retrieve a cover image that was downloaded from import list sources. Returns 404 if the cover doesn't exist.",
  request: {
    params: z.object({
      filename: z.string().describe("Cover image filename"),
    }),
  },
  responses: {
    200: {
      description: "Cover image",
      content: {
        "image/jpeg": {
          schema: z.any(),
        },
        "image/png": {
          schema: z.any(),
        },
        "image/gif": {
          schema: z.any(),
        },
        "image/webp": {
          schema: z.any(),
        },
      },
    },
    404: {
      description: "Cover not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(getCoverRoute, async (c) => {
  try {
    const { filename } = c.req.valid("param");

    // Sanitize filename to prevent directory traversal
    // Block: forward/back slashes, double dots (..), and any path separators
    const sanitizedFilename = filename.replace(/[/\\]|\.{2,}/g, "");
    if (sanitizedFilename !== filename) {
      return c.json(
        {
          error: "Invalid filename",
          details: "Filename contains invalid characters",
        },
        404,
      );
    }

    // Get covers directory
    const coversDir = await coverDownloader.getCoversDirectory();
    const filePath = join(coversDir, sanitizedFilename);

    // Check if file exists
    try {
      await access(filePath);
    } catch {
      return c.json(
        {
          error: "Cover not found",
          details: `No cover found with filename: ${sanitizedFilename}`,
        },
        404,
      );
    }

    // Read and serve the file
    const imageBuffer = await readFile(filePath);
    const ext = extname(sanitizedFilename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "image/jpeg";

    // Set cache headers for better performance
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "public, max-age=86400"); // 1 day cache
    c.header("Content-Length", imageBuffer.length.toString());

    return c.body(imageBuffer);
  } catch (error) {
    logger.error("[Covers] Error serving cover:", error);
    return c.json(
      {
        error: "Failed to retrieve cover",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;
