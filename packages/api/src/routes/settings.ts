import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { appSettingsService } from "../services/app-settings.js";
import {
  appSettingsSchema,
  updateAppSettingsSchema,
  errorResponseSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import { startRequestChecker } from "../index.js";

const app = new OpenAPIHono();

// Get app settings
const getSettingsRoute = createRoute({
  method: "get",
  path: "/settings",
  tags: ["Settings"],
  summary: "Get application settings",
  description:
    "Get current application settings including post-download action configuration",
  responses: {
    200: {
      description: "Application settings",
      content: {
        "application/json": {
          schema: appSettingsSchema,
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
    const settings = await appSettingsService.getSettingsForResponse();
    return c.json(settings, 200);
  } catch (error: unknown) {
    logger.error("[Settings API] Get settings error:", error);
    return c.json(
      {
        error: "Failed to get application settings",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Update app settings
const updateSettingsRoute = createRoute({
  method: "put",
  path: "/settings",
  tags: ["Settings"],
  summary: "Update application settings",
  description:
    "Update application configuration. Supports changing post-download action: move_only (just move to INGEST_FOLDER), upload_only (upload to Booklore and delete file), or both (move AND upload).",
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateAppSettingsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Settings updated successfully",
      content: {
        "application/json": {
          schema: appSettingsSchema,
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

    logger.info("[Settings API] Updating settings:", updates);

    // Get current settings to compare
    const currentSettings = await appSettingsService.getSettings();
    await appSettingsService.updateSettings(updates);
    const response = await appSettingsService.getSettingsForResponse();

    // Restart request checker only if interval actually changed
    if (
      updates.requestCheckInterval &&
      currentSettings.requestCheckInterval !== updates.requestCheckInterval
    ) {
      logger.info(
        `[Settings API] Request check interval changed from ${currentSettings.requestCheckInterval} to ${updates.requestCheckInterval}, restarting checker`,
      );
      await startRequestChecker();
    }

    logger.success("[Settings API] Settings updated successfully");

    return c.json(response, 200);
  } catch (error: unknown) {
    logger.error("[Settings API] Update settings error:", error);

    const errorMessage = getErrorMessage(error);
    const status = errorMessage.includes("Invalid") ? 400 : 500;

    return c.json(
      {
        error: "Failed to update settings",
        details: errorMessage,
      },
      status,
    );
  }
});

export default app;
