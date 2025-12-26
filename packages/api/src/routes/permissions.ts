import { Hono } from "hono";
import { permissionsService } from "../services/permissions.js";

const app = new Hono();

/**
 * GET /permissions - Get current user's permissions
 */
app.get("/permissions", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Authentication required",
      },
      401,
    );
  }

  try {
    // Admins always have all permissions
    if (user.role === "admin") {
      return c.json({
        canDeleteDownloads: true,
        canConfigureNotifications: true,
        canManageRequests: true,
        canConfigureApp: true,
        canConfigureIntegrations: true,
        canConfigureEmail: true,
        canSeeDownloadOwner: true,
        canManageApiKeys: true,
      });
    }

    // Get permissions for regular users
    const permissions = await permissionsService.getPermissions(user.id);

    return c.json({
      canDeleteDownloads: permissions.canDeleteDownloads,
      canConfigureNotifications: permissions.canConfigureNotifications,
      canManageRequests: permissions.canManageRequests,
      canConfigureApp: permissions.canConfigureApp,
      canConfigureIntegrations: permissions.canConfigureIntegrations,
      canConfigureEmail: permissions.canConfigureEmail,
      canSeeDownloadOwner: permissions.canSeeDownloadOwner,
      canManageApiKeys: permissions.canManageApiKeys,
    });
  } catch (error) {
    console.error("[Permissions] Error fetching permissions:", error);
    return c.json(
      {
        error: "Failed to fetch permissions",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;
