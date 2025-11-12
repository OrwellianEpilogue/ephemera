import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { appriseService } from "../services/apprise.js";
import {
  appriseSettingsSchema,
  updateAppriseSettingsSchema,
  appriseTestResponseSchema,
  errorResponseSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";

const app = new OpenAPIHono();

// Get Apprise settings
const getAppriseSettingsRoute = createRoute({
  method: "get",
  path: "/apprise/settings",
  tags: ["Apprise"],
  summary: "Get Apprise notification settings",
  description:
    "Get current Apprise notification configuration including server URL and notification toggles",
  responses: {
    200: {
      description: "Apprise settings",
      content: {
        "application/json": {
          schema: appriseSettingsSchema,
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

app.openapi(getAppriseSettingsRoute, async (c) => {
  try {
    const settings = await appriseService.getSettingsForResponse();
    return c.json(settings, 200);
  } catch (error: unknown) {
    logger.error("[Apprise API] Get settings error:", error);
    return c.json(
      {
        error: "Failed to get Apprise settings",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Update Apprise settings
const updateAppriseSettingsRoute = createRoute({
  method: "put",
  path: "/apprise/settings",
  tags: ["Apprise"],
  summary: "Update Apprise notification settings",
  description:
    "Update Apprise configuration including server URL, custom headers, and notification toggles",
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateAppriseSettingsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Settings updated successfully",
      content: {
        "application/json": {
          schema: appriseSettingsSchema,
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

app.openapi(updateAppriseSettingsRoute, async (c) => {
  try {
    const updates = c.req.valid("json");

    logger.info("[Apprise API] Updating settings:", {
      ...updates,
      customHeaders: updates.customHeaders
        ? Object.keys(updates.customHeaders)
        : undefined,
    });

    await appriseService.updateSettings(updates);
    const response = await appriseService.getSettingsForResponse();

    logger.success("[Apprise API] Settings updated successfully");

    return c.json(response, 200);
  } catch (error: unknown) {
    logger.error("[Apprise API] Update settings error:", error);

    const errorMessage = getErrorMessage(error);
    const status =
      errorMessage.includes("Invalid") || errorMessage.includes("required")
        ? 400
        : 500;

    return c.json(
      {
        error: "Failed to update Apprise settings",
        details: errorMessage,
      },
      status,
    );
  }
});

// Test Apprise notification
const testAppriseRoute = createRoute({
  method: "post",
  path: "/apprise/test",
  tags: ["Apprise"],
  summary: "Send test notification",
  description:
    "Send a test notification to verify Apprise configuration is working",
  responses: {
    200: {
      description: "Test result",
      content: {
        "application/json": {
          schema: appriseTestResponseSchema,
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

app.openapi(testAppriseRoute, async (c) => {
  try {
    logger.info("[Apprise API] Sending test notification");

    const result = await appriseService.test();
    const settings = await appriseService.getSettings();

    if (result.success) {
      logger.success("[Apprise API] Test notification sent successfully");
    } else {
      logger.warn("[Apprise API] Test notification failed:", result.message);
    }

    return c.json(
      {
        success: result.success,
        message: result.message,
        serverUrl: settings.serverUrl || "",
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("[Apprise API] Test notification error:", error);
    return c.json(
      {
        error: "Failed to send test notification",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

export default app;
