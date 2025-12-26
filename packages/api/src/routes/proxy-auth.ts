import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyAuthSettingsService } from "../services/proxy-auth-settings.js";
import {
  proxyAuthSettingsSchema,
  updateProxyAuthSettingsSchema,
  errorResponseSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";

const app = new OpenAPIHono();

// Get proxy auth settings
const getSettingsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Proxy Auth"],
  summary: "Get proxy auth settings",
  description:
    "Get current proxy authentication settings for reverse proxy header auth (Authelia, Authentik, etc.)",
  responses: {
    200: {
      description: "Proxy auth settings",
      content: {
        "application/json": {
          schema: proxyAuthSettingsSchema,
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
    const settings = await proxyAuthSettingsService.getSettingsForResponse();
    return c.json(settings, 200);
  } catch (error: unknown) {
    logger.error("[Proxy Auth API] Get settings error:", error);
    return c.json(
      {
        error: "Failed to get proxy auth settings",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Update proxy auth settings
const updateSettingsRoute = createRoute({
  method: "put",
  path: "/",
  tags: ["Proxy Auth"],
  summary: "Update proxy auth settings",
  description: `Update proxy authentication configuration.

**Security Notes:**
- Only enable if your application is behind a trusted reverse proxy
- The proxy MUST strip the authentication header from all incoming requests
- Only requests from trusted proxy IPs will be processed
- Users must pre-exist in the system (no auto-provisioning)
- API routes are NEVER affected by proxy auth (only web UI)`,
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateProxyAuthSettingsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Settings updated successfully",
      content: {
        "application/json": {
          schema: proxyAuthSettingsSchema,
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

    logger.info("[Proxy Auth API] Updating settings:", {
      enabled: updates.enabled,
      headerName: updates.headerName,
      userIdentifier: updates.userIdentifier,
      trustedProxies: updates.trustedProxies
        ? `${updates.trustedProxies.substring(0, 30)}...`
        : undefined,
      logoutRedirectUrl: updates.logoutRedirectUrl,
    });

    await proxyAuthSettingsService.updateSettings(updates);
    const response = await proxyAuthSettingsService.getSettingsForResponse();

    logger.success("[Proxy Auth API] Settings updated successfully");

    return c.json(response, 200);
  } catch (error: unknown) {
    logger.error("[Proxy Auth API] Update settings error:", error);

    const errorMessage = getErrorMessage(error);
    const status =
      errorMessage.includes("Trusted proxies") ||
      errorMessage.includes("Invalid")
        ? 400
        : 500;

    return c.json(
      {
        error: "Failed to update proxy auth settings",
        details: errorMessage,
      },
      status,
    );
  }
});

export default app;
