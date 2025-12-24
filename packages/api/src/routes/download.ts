import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { queueManager } from "../services/queue-manager.js";
import { errorResponseSchema, getErrorMessage } from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import { downloadTracker } from "../services/download-tracker.js";
import { existsSync, createReadStream, statSync } from "fs";
import { extname } from "path";
import { stream } from "hono/streaming";

const app = new OpenAPIHono();

const downloadRoute = createRoute({
  method: "post",
  path: "/download/{md5}",
  tags: ["Download"],
  summary: "Queue a book for download",
  description:
    "Add a book to the download queue by its MD5 hash. The original filename from the server will be used automatically. Request body is optional.",
  request: {
    params: z.object({
      md5: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .describe("MD5 hash of the book"),
    }),
  },
  responses: {
    200: {
      description: "Successfully queued for download",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string().describe("Queue status"),
            md5: z.string().describe("MD5 hash"),
            position: z.number().optional().describe("Position in queue"),
            message: z.string().optional().describe("Status message"),
          }),
        },
      },
    },
    400: {
      description: "Invalid MD5 hash",
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

app.openapi(downloadRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    logger.info(`Download request for: ${md5}`);

    const result = await queueManager.addToQueue(md5);

    if (result.status === "already_downloaded") {
      return c.json(
        {
          status: "already_downloaded",
          md5,
          message: "This book has already been downloaded",
          filePath: result.existing?.finalPath,
        },
        200,
      );
    }

    if (result.status === "already_in_queue") {
      return c.json(
        {
          status: "already_in_queue",
          md5,
          position: result.position,
          message: "This book is already in the download queue",
        },
        200,
      );
    }

    return c.json(
      {
        status: "queued",
        md5,
        position: result.position,
        message: `Queued for download at position ${result.position}`,
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Download queue error:", error);

    return c.json(
      {
        error: "Failed to queue download",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

const cancelRoute = createRoute({
  method: "delete",
  path: "/download/{md5}",
  tags: ["Download"],
  summary: "Cancel a queued download",
  description: "Remove a book from the download queue",
  request: {
    params: z.object({
      md5: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .describe("MD5 hash of the book"),
    }),
  },
  responses: {
    200: {
      description: "Successfully cancelled",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
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

app.openapi(cancelRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    logger.info(`Cancel request for: ${md5}`);

    const success = await queueManager.cancelDownload(md5);

    return c.json(
      {
        success,
        message: success
          ? "Download cancelled"
          : "Download not found in queue or currently downloading",
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Cancel error:", error);

    return c.json(
      {
        error: "Failed to cancel download",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/download/{md5}/permanent",
  tags: ["Download"],
  summary: "Delete a download record",
  description:
    "Permanently delete a download record from the database. The downloaded file will not be deleted from disk.",
  request: {
    params: z.object({
      md5: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .openapi({
          description: "MD5 hash of the book",
          example: "5d41402abc4b2a76b9719d911017c592",
        }),
    }),
  },
  responses: {
    200: {
      description: "Download deleted successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(deleteRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    logger.info(`Delete request for: ${md5}`);

    const success = await queueManager.deleteDownload(md5);

    return c.json(
      {
        success,
        message: success
          ? "Download deleted successfully"
          : "Download not found",
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Delete error:", error);

    return c.json(
      {
        error: "Failed to delete download",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

const retryRoute = createRoute({
  method: "post",
  path: "/download/{md5}/retry",
  tags: ["Download"],
  summary: "Retry a failed download",
  description:
    "Retry a download that failed or was cancelled. Resets retry count and re-adds to queue.",
  request: {
    params: z.object({
      md5: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .describe("MD5 hash of the book"),
    }),
  },
  responses: {
    200: {
      description: "Successfully queued for retry",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string().describe("Queue status"),
            md5: z.string().describe("MD5 hash"),
            position: z.number().optional().describe("Position in queue"),
            message: z.string().describe("Status message"),
          }),
        },
      },
    },
    400: {
      description: "Invalid request (download not in error/cancelled state)",
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

app.openapi(retryRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    logger.info(`Retry request for: ${md5}`);

    const result = await queueManager.retryDownload(md5);

    return c.json(
      {
        status: result.status,
        md5,
        position: result.position,
        message: `Queued for retry at position ${result.position}`,
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Retry error:", error);

    const errorMessage = getErrorMessage(error);
    // Check if it's a validation error (wrong status)
    if (
      errorMessage.includes("Cannot retry") ||
      errorMessage.includes("not found")
    ) {
      return c.json(
        {
          error: "Invalid retry request",
          details: errorMessage,
        },
        400,
      );
    }

    return c.json(
      {
        error: "Failed to retry download",
        details: errorMessage,
      },
      500,
    );
  }
});

const fileRoute = createRoute({
  method: "get",
  path: "/download/{md5}/file",
  tags: ["Download"],
  summary: "Download a file",
  description:
    "Download a file that has been downloaded to the server. Only works for downloads with status 'available' or 'done'.",
  request: {
    params: z.object({
      md5: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .describe("MD5 hash of the book"),
    }),
  },
  responses: {
    200: {
      description: "File downloaded successfully",
      content: {
        "application/octet-stream": {
          schema: z.any(),
        },
      },
    },
    404: {
      description: "Download not found or file not available",
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

app.openapi(fileRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    logger.info(`File download request for: ${md5}`);

    // Get the download record
    const download = await downloadTracker.get(md5);

    if (!download) {
      return c.json(
        {
          error: "Download not found",
          details: `No download record found for MD5: ${md5}`,
        },
        404,
      );
    }

    // Check if download is in correct status
    if (download.status !== "available" && download.status !== "done") {
      return c.json(
        {
          error: "File not available",
          details: `Download status is '${download.status}'. File can only be downloaded when status is 'available' or 'done'.`,
        },
        404,
      );
    }

    // Determine which path to use
    const filePath =
      download.status === "available" ? download.finalPath : download.tempPath;

    if (!filePath) {
      return c.json(
        {
          error: "File path not found",
          details: "The download record does not have a file path.",
        },
        404,
      );
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      logger.error(`File not found at path: ${filePath}`);
      return c.json(
        {
          error: "File not found",
          details: "The file has been moved or deleted from the server.",
        },
        404,
      );
    }

    // Get file stats for Content-Length
    const stats = statSync(filePath);

    // Generate filename for download
    const format = (
      download.format ||
      extname(filePath).slice(1) ||
      "pdf"
    ).toLowerCase();
    const title = download.title || "book";
    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();

    // Build filename with author, year, and language
    const parts = [safeTitle];

    // Add author if available (in downloads table it's a single string)
    if (download.author) {
      const safeAuthor = download.author.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
      if (safeAuthor) parts.push(safeAuthor);
    }

    // Add year if available
    if (download.year) {
      parts.push(download.year.toString());
    }

    // Add language if available
    if (download.language) {
      parts.push(download.language.toUpperCase());
    }

    const filename = `${parts.join(" - ")}.${format}`;

    // Set appropriate headers
    c.header("Content-Type", "application/octet-stream");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Content-Length", stats.size.toString());

    // Stream the file to avoid loading entire file into memory
    return stream(c, async (s) => {
      const fileStream = createReadStream(filePath);
      for await (const chunk of fileStream) {
        await s.write(chunk);
      }
    });
  } catch (error: unknown) {
    logger.error("File download error:", error);

    return c.json(
      {
        error: "Failed to download file",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

export default app;
