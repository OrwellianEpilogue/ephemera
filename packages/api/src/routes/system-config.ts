import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { appConfigService } from "../services/app-config.js";
import {
  systemConfigSchema,
  updateSystemConfigSchema,
  errorResponseSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";

const app = new OpenAPIHono();

// Get system configuration
const getSystemConfigRoute = createRoute({
  method: "get",
  path: "/system-config",
  tags: ["System Config"],
  summary: "Get system configuration",
  description:
    "Get current system configuration including folder paths and download settings",
  responses: {
    200: {
      description: "System configuration",
      content: {
        "application/json": {
          schema: systemConfigSchema,
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

app.openapi(getSystemConfigRoute, async (c) => {
  try {
    const config = await appConfigService.getConfigForResponse();
    return c.json(config, 200);
  } catch (error: unknown) {
    logger.error("[System Config API] Get config error:", error);
    return c.json(
      {
        error: "Failed to get system configuration",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Update system configuration
const updateSystemConfigRoute = createRoute({
  method: "put",
  path: "/system-config",
  tags: ["System Config"],
  summary: "Update system configuration",
  description:
    "Update system configuration. Supports changing folder paths and download settings.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateSystemConfigSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Configuration updated successfully",
      content: {
        "application/json": {
          schema: systemConfigSchema,
        },
      },
    },
    400: {
      description: "Invalid configuration",
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

app.openapi(updateSystemConfigRoute, async (c) => {
  try {
    const updates = c.req.valid("json");

    logger.info("[System Config API] Updating config:", updates);

    await appConfigService.updateConfig(updates);
    const response = await appConfigService.getConfigForResponse();

    logger.success("[System Config API] Config updated successfully");

    return c.json(response, 200);
  } catch (error: unknown) {
    logger.error("[System Config API] Update config error:", error);

    const errorMessage = getErrorMessage(error);
    const status = errorMessage.includes("Invalid") ? 400 : 500;

    return c.json(
      {
        error: "Failed to update system configuration",
        details: errorMessage,
      },
      status,
    );
  }
});

export default app;
