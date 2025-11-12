import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { versionService } from "../services/version.js";
import { versionInfoSchema, errorResponseSchema } from "@ephemera/shared";
import { logger } from "../utils/logger.js";

const app = new OpenAPIHono();

// Get version info
const getVersionRoute = createRoute({
  method: "get",
  path: "/version",
  tags: ["Version"],
  summary: "Get version information",
  description:
    "Get current application version and check for updates from GitHub",
  responses: {
    200: {
      description: "Version information",
      content: {
        "application/json": {
          schema: versionInfoSchema,
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

app.openapi(getVersionRoute, async (c) => {
  try {
    const versionInfo = await versionService.getVersionInfo();
    return c.json(versionInfo, 200);
  } catch (error: unknown) {
    logger.error("[Version API] Get version error:", error);
    return c.json(
      {
        error: "Failed to get version information",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;
