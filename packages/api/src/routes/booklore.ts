import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { bookloreSettingsService } from "../services/booklore-settings.js";
import { bookloreUploader } from "../services/booklore-uploader.js";
import { downloadTracker } from "../services/download-tracker.js";
import {
  bookloreSettingsResponseSchema,
  updateBookloreSettingsSchema,
  bookloreUploadResponseSchema,
  bookloreTestResponseSchema,
  errorResponseSchema,
  queueItemSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import { fetchLibraries } from "../services/booklore-client.js";

const app = new OpenAPIHono();

// Add validation error logging middleware
app.onError((err, _c) => {
  logger.error("[Booklore Routes] Error:", err);
  logger.error(
    "[Booklore Routes] Error details:",
    JSON.stringify(err, null, 2),
  );

  // Pass error to parent handler
  throw err;
});

// Get Booklore settings
const getSettingsRoute = createRoute({
  method: "get",
  path: "/booklore/settings",
  tags: ["Booklore"],
  summary: "Get Booklore settings",
  description:
    "Get current Booklore integration settings (token is hidden for security)",
  responses: {
    200: {
      description: "Booklore settings",
      content: {
        "application/json": {
          schema: bookloreSettingsResponseSchema.nullable(),
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

app.openapi(getSettingsRoute, async (c) => {
  try {
    const settings = await bookloreSettingsService.getSettingsForResponse();
    return c.json(settings, 200);
  } catch (error: unknown) {
    logger.error("[Booklore API] Get settings error:", error);
    return c.json(
      {
        error: "Failed to get Booklore settings",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Update Booklore settings
const updateSettingsRoute = createRoute({
  method: "put",
  path: "/booklore/settings",
  tags: ["Booklore"],
  summary: "Update Booklore settings",
  description:
    "Update Booklore integration configuration. All fields are optional. When enabling, baseUrl, token, libraryId, and pathId are required.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateBookloreSettingsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Settings updated successfully",
      content: {
        "application/json": {
          schema: bookloreSettingsResponseSchema.nullable(),
        },
      },
    },
    400: {
      description: "Invalid settings",
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

app.openapi(updateSettingsRoute, async (c) => {
  try {
    const updates = c.req.valid("json");

    logger.info("[Booklore API] Updating settings (credentials redacted)");

    await bookloreSettingsService.updateSettings(updates);

    // Return response via getSettingsForResponse (handles masking credentials)
    const response = await bookloreSettingsService.getSettingsForResponse();

    logger.info("[Booklore API] Settings updated successfully");
    return c.json(response, 200);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error("[Booklore API] Update settings error:", errorMessage);
    return c.json(
      {
        error: "Failed to update Booklore settings",
        details: errorMessage,
      },
      errorMessage.includes("required") ? 400 : 500,
    );
  }
});

// Disable Booklore
const disableRoute = createRoute({
  method: "delete",
  path: "/booklore/settings",
  tags: ["Booklore"],
  summary: "Disable Booklore integration",
  description:
    "Disable Booklore integration (keeps settings but sets enabled=false)",
  responses: {
    204: {
      description: "Booklore disabled successfully",
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

app.openapi(disableRoute, async (c) => {
  try {
    await bookloreSettingsService.disable();
    logger.info("[Booklore API] Booklore disabled");
    return c.body(null, 204);
  } catch (error: unknown) {
    logger.error("[Booklore API] Disable error:", error);
    return c.json(
      {
        error: "Failed to disable Booklore",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Test Booklore connection
const testConnectionRoute = createRoute({
  method: "post",
  path: "/booklore/test",
  tags: ["Booklore"],
  summary: "Test Booklore connection",
  description: "Test connection to Booklore API with current settings",
  responses: {
    200: {
      description: "Connection test result",
      content: {
        "application/json": {
          schema: bookloreTestResponseSchema,
        },
      },
    },
    400: {
      description: "Booklore not configured",
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

app.openapi(testConnectionRoute, async (c) => {
  try {
    const settings = await bookloreSettingsService.getSettings();
    if (!settings || !settings.baseUrl || !settings.accessToken) {
      return c.json(
        {
          error: "Booklore is not configured",
          details: "Please configure and authenticate with Booklore first",
        },
        400,
      );
    }

    const result = await bookloreUploader.testConnection();
    return c.json(
      {
        ...result,
        baseUrl: settings.baseUrl,
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("[Booklore API] Test connection error:", error);
    return c.json(
      {
        error: "Connection test failed",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Get libraries from Booklore
const getLibrariesRoute = createRoute({
  method: "get",
  path: "/booklore/libraries",
  tags: ["Booklore"],
  summary: "Get Booklore libraries",
  description:
    "Fetch all available libraries and their paths from Booklore API",
  responses: {
    200: {
      description: "List of libraries with their paths",
      content: {
        "application/json": {
          schema: z.object({
            libraries: z.array(
              z.object({
                id: z.number(),
                name: z.string(),
                icon: z.string(),
                watch: z.boolean(),
                paths: z.array(
                  z.object({
                    id: z.number(),
                    path: z.string(),
                  }),
                ),
                scanMode: z.string(),
                defaultBookFormat: z.string().optional(),
              }),
            ),
          }),
        },
      },
    },
    400: {
      description: "Booklore not configured",
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

app.openapi(getLibrariesRoute, async (c) => {
  try {
    const settings = await bookloreSettingsService.getSettings();
    if (!settings || !settings.baseUrl || !settings.accessToken) {
      return c.json(
        {
          error: "Booklore is not configured",
          details: "Please configure and authenticate with Booklore first",
        },
        400,
      );
    }

    logger.info("[Booklore API] Fetching libraries");
    const libraries = await fetchLibraries(
      settings.baseUrl,
      settings.accessToken,
    );

    return c.json(
      {
        libraries,
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("[Booklore API] Get libraries error:", error);
    return c.json(
      {
        error: "Failed to fetch libraries",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Manual upload
const uploadRoute = createRoute({
  method: "post",
  path: "/booklore/upload/{md5}",
  tags: ["Booklore"],
  summary: "Upload file to Booklore",
  description: "Manually trigger upload of a downloaded file to Booklore",
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
      description: "Upload result",
      content: {
        "application/json": {
          schema: bookloreUploadResponseSchema,
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
    404: {
      description: "Download not found",
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

app.openapi(uploadRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    // Check if Booklore is enabled
    const isEnabled = await bookloreSettingsService.isEnabled();
    if (!isEnabled) {
      return c.json(
        {
          error: "Booklore is not enabled",
          details: "Please enable and configure Booklore first",
        },
        400,
      );
    }

    // Get download
    const download = await downloadTracker.get(md5);
    if (!download) {
      return c.json(
        {
          error: "Download not found",
          details: `No download found with MD5: ${md5}`,
        },
        404,
      );
    }

    // Check if file is available
    if (download.status !== "available" || !download.finalPath) {
      return c.json(
        {
          error: "File not available for upload",
          details: `Download status is '${download.status}'. File must be in 'available' status with a valid file path.`,
        },
        400,
      );
    }

    // Perform upload
    logger.info(`[Booklore API] Manual upload requested for ${md5}`);
    await downloadTracker.markUploadStarted(md5);

    const result = await bookloreUploader.uploadFile(download.finalPath);

    if (result.success) {
      await downloadTracker.markUploadCompleted(md5);
      return c.json(
        {
          success: true,
          message: "File uploaded successfully to Booklore",
          uploadedAt: new Date().toISOString(),
        },
        200,
      );
    } else {
      await downloadTracker.markUploadFailed(
        md5,
        result.error || "Unknown error",
      );
      return c.json(
        {
          error: "Upload failed",
          details: result.error || "Unknown error",
        },
        500,
      );
    }
  } catch (error: unknown) {
    logger.error("[Booklore API] Upload error:", error);
    return c.json(
      {
        error: "Upload failed",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Get uploads by status
const getUploadsRoute = createRoute({
  method: "get",
  path: "/booklore/uploads",
  tags: ["Booklore"],
  summary: "Get uploads by status",
  description: "Get all uploads filtered by upload status",
  request: {
    query: z.object({
      status: z
        .enum(["pending", "uploading", "completed", "failed"])
        .optional()
        .describe("Filter by upload status"),
      limit: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(50)
        .describe("Results per page"),
      offset: z.coerce
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Offset for pagination"),
    }),
  },
  responses: {
    200: {
      description: "List of uploads",
      content: {
        "application/json": {
          schema: z.object({
            uploads: z.array(queueItemSchema),
            total: z.number(),
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

app.openapi(getUploadsRoute, async (c) => {
  try {
    const { status, limit, offset } = c.req.valid("query");

    let uploads;
    if (status) {
      uploads = await downloadTracker.getByUploadStatus(status);
    } else {
      // Get all uploads (those with any upload status)
      const pending = await downloadTracker.getByUploadStatus("pending");
      const uploading = await downloadTracker.getByUploadStatus("uploading");
      const completed = await downloadTracker.getByUploadStatus("completed");
      const failed = await downloadTracker.getByUploadStatus("failed");
      uploads = [...pending, ...uploading, ...completed, ...failed];
    }

    // Apply pagination
    const total = uploads.length;
    const paginatedUploads = uploads.slice(offset, offset + limit);

    return c.json(
      {
        uploads: paginatedUploads.map((d) =>
          downloadTracker.downloadToQueueItem(d),
        ),
        total,
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("[Booklore API] Get uploads error:", error);
    return c.json(
      {
        error: "Failed to get uploads",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Retry failed upload
const retryUploadRoute = createRoute({
  method: "post",
  path: "/booklore/upload/{md5}/retry",
  tags: ["Booklore"],
  summary: "Retry failed upload",
  description: "Retry uploading a file that previously failed",
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
      description: "Retry result",
      content: {
        "application/json": {
          schema: bookloreUploadResponseSchema,
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
    404: {
      description: "Download not found",
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

app.openapi(retryUploadRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    // Get download
    const download = await downloadTracker.get(md5);
    if (!download) {
      return c.json(
        {
          error: "Download not found",
          details: `No download found with MD5: ${md5}`,
        },
        404,
      );
    }

    // Check if upload failed
    if (download.uploadStatus !== "failed") {
      return c.json(
        {
          error: "Upload not in failed status",
          details: `Upload status is '${download.uploadStatus}'. Can only retry failed uploads.`,
        },
        400,
      );
    }

    // Retry upload
    logger.info(`[Booklore API] Retrying upload for ${md5}`);
    await downloadTracker.markUploadStarted(md5);

    const result = await bookloreUploader.uploadFile(download.finalPath!);

    if (result.success) {
      await downloadTracker.markUploadCompleted(md5);
      return c.json(
        {
          success: true,
          message: "File uploaded successfully to Booklore",
          uploadedAt: new Date().toISOString(),
        },
        200,
      );
    } else {
      await downloadTracker.markUploadFailed(
        md5,
        result.error || "Unknown error",
      );
      return c.json(
        {
          error: "Upload failed",
          details: result.error || "Unknown error",
        },
        500,
      );
    }
  } catch (error: unknown) {
    logger.error("[Booklore API] Retry upload error:", error);
    return c.json(
      {
        error: "Retry failed",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

export default app;
