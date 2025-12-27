import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { calibreService } from "../services/calibre.js";
import { downloadTracker } from "../services/download-tracker.js";
import {
  calibreStatusResponseSchema,
  calibreFormatsResponseSchema,
  calibreConvertRequestSchema,
  calibreConvertResponseSchema,
  errorResponseSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import type { User } from "../db/schema.js";

const app = new OpenAPIHono();

// Helper to check if user is admin
const isAdmin = (user: User): boolean => user.role === "admin";

// ============== Status Route ==============

// GET /calibre/status
const getStatusRoute = createRoute({
  method: "get",
  path: "/calibre/status",
  tags: ["Calibre"],
  summary: "Get Calibre CLI status",
  description:
    "Check if Calibre CLI (ebook-convert) is available and get version",
  responses: {
    200: {
      description: "Calibre status",
      content: {
        "application/json": {
          schema: calibreStatusResponseSchema,
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

app.openapi(getStatusRoute, async (c) => {
  try {
    const status = await calibreService.getStatus();
    return c.json(status, 200);
  } catch (error: unknown) {
    logger.error("[Calibre API] Get status error:", error);
    return c.json(
      {
        error: "Failed to get Calibre status",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// ============== Formats Route ==============

// GET /calibre/formats
const getFormatsRoute = createRoute({
  method: "get",
  path: "/calibre/formats",
  tags: ["Calibre"],
  summary: "Get supported formats",
  description: "Get list of supported input and output formats for conversion",
  responses: {
    200: {
      description: "Supported formats",
      content: {
        "application/json": {
          schema: calibreFormatsResponseSchema,
        },
      },
    },
  },
});

app.openapi(getFormatsRoute, async (c) => {
  return c.json(
    {
      input: calibreService.getSupportedInputFormats(),
      output: calibreService.getSupportedOutputFormats(),
    },
    200,
  );
});

// ============== Convert Route ==============

// POST /calibre/convert
const convertRoute = createRoute({
  method: "post",
  path: "/calibre/convert",
  tags: ["Calibre"],
  summary: "Convert a book",
  description: "Convert a downloaded book to a different format using Calibre",
  request: {
    body: {
      content: {
        "application/json": {
          schema: calibreConvertRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Conversion result",
      content: {
        "application/json": {
          schema: calibreConvertResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - user cannot convert this book",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Book not found",
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

app.openapi(convertRoute, async (c) => {
  try {
    const user = c.get("user") as User;
    const { md5, outputFormat } = c.req.valid("json");

    // Check if Calibre is available
    const available = await calibreService.isAvailable();
    if (!available) {
      return c.json(
        {
          error: "Calibre CLI is not available",
          details: "ebook-convert is not installed or not in PATH",
        },
        400,
      );
    }

    // Get download info
    const download = await downloadTracker.get(md5);
    if (!download) {
      return c.json({ error: "Book not found" }, 404);
    }

    // Check ownership or admin status
    const isOwner = download.userId === user.id;
    if (!isAdmin(user) && !isOwner) {
      return c.json({ error: "You can only convert your own downloads" }, 403);
    }

    // Check if book has a file path
    const filePath = download.tempPath || download.finalPath;
    if (!filePath) {
      return c.json(
        { error: "Book file is not available for conversion" },
        400,
      );
    }

    // Get current format
    const currentFormat = download.format?.toLowerCase() || "";
    if (!calibreService.canConvert(currentFormat, outputFormat)) {
      return c.json(
        {
          error: `Cannot convert from ${currentFormat} to ${outputFormat}`,
        },
        400,
      );
    }

    // Perform conversion
    const convertedPath = await calibreService.convert(filePath, outputFormat);

    return c.json(
      {
        success: true,
        convertedPath,
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("[Calibre API] Convert error:", error);
    return c.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      500,
    );
  }
});

export default app;
