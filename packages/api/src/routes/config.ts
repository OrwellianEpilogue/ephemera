import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { appSettingsService } from "../services/app-settings.js";
import { emailSettingsService } from "../services/email-settings.js";
import { flareSolverrHealthService } from "../services/flaresolverr-health.js";
import { frontendConfigSchema, errorResponseSchema } from "@ephemera/shared";
import { logger } from "../utils/logger.js";

const app = new OpenAPIHono();

// Get frontend config - safe values for all authenticated users
const getConfigRoute = createRoute({
  method: "get",
  path: "/config",
  tags: ["Config"],
  summary: "Get frontend configuration",
  description:
    "Get safe configuration values needed by the frontend. Available to all authenticated users.",
  responses: {
    200: {
      description: "Frontend configuration",
      content: {
        "application/json": {
          schema: frontendConfigSchema,
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

app.openapi(getConfigRoute, async (c) => {
  try {
    const appSettings = await appSettingsService.getSettings();
    const emailSettings = await emailSettingsService.getSettings();
    const maintenanceStatus = flareSolverrHealthService.getStatus();

    return c.json(
      {
        // From app settings (UI preferences)
        keepInDownloads: appSettings.postDownloadKeepInDownloads,
        timeFormat: appSettings.timeFormat,
        dateFormat: appSettings.dateFormat,
        libraryUrl: appSettings.libraryUrl,
        libraryLinkLocation: appSettings.libraryLinkLocation,

        // From email settings (just enabled status, no credentials)
        emailEnabled: emailSettings?.enabled ?? false,

        // Maintenance mode status
        maintenanceMode: maintenanceStatus.inMaintenanceMode,
        maintenanceReason: maintenanceStatus.reason,
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("[Config API] Get config error:", error);
    return c.json(
      {
        error: "Failed to get configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;
