import { createMiddleware } from "hono/factory";
import { auth } from "../auth.js";
import { permissionsService } from "../services/permissions.js";
import type { User } from "../db/schema.js";
import { logger } from "../utils/logger.js";

// Extend Hono context to include user and session cache marker
declare module "hono" {
  interface ContextVariableMap {
    user: User;
    sessionChecked: boolean;
  }
}

/**
 * Middleware to require authentication
 * Validates session and attaches user to context
 * Uses request-scoped caching to prevent multiple session fetches
 */
export const requireAuth = createMiddleware(async (c, next) => {
  try {
    // Check if session was already fetched this request (request-scoped cache)
    const existingUser = c.get("user");
    if (existingUser && c.get("sessionChecked")) {
      logger.debug(`[PERF] Auth session cache HIT (request-scoped)`);
      await next();
      return;
    }

    // Get session from Better Auth
    logger.debug(`[PERF] Auth session cache MISS - fetching from Better Auth`);
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session || !session.user) {
      return c.json(
        {
          error: "Unauthorized",
          message: "You must be logged in to access this resource",
        },
        401,
      );
    }

    // Attach user to context and mark session as checked
    c.set("user", session.user as User);
    c.set("sessionChecked", true);

    await next();
  } catch (error) {
    console.error("[Auth Middleware] Authentication error:", error);
    return c.json(
      {
        error: "Authentication failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      401,
    );
  }
});

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export const requireAdmin = createMiddleware(async (c, next) => {
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

  if (user.role !== "admin") {
    return c.json(
      {
        error: "Forbidden",
        message: "You must be an admin to access this resource",
      },
      403,
    );
  }

  await next();
});

/**
 * Middleware factory to require a specific permission
 * Must be used after requireAuth
 */
export const requirePermission = (
  permission:
    | "canDeleteDownloads"
    | "canConfigureNotifications"
    | "canManageRequests"
    | "canStartDownloads"
    | "canConfigureApp"
    | "canConfigureIntegrations"
    | "canConfigureEmail"
    | "canSeeDownloadOwner"
    | "canManageApiKeys",
) => {
  return createMiddleware(async (c, next) => {
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

    // Admins bypass permission checks
    if (user.role === "admin") {
      await next();
      return;
    }

    // Check specific permission
    const hasPermission = await permissionsService.canPerform(
      user.id,
      permission,
    );

    if (!hasPermission) {
      return c.json(
        {
          error: "Forbidden",
          message: `You do not have permission to perform this action (${permission})`,
        },
        403,
      );
    }

    await next();
  });
};

/**
 * Helper function to check if user can access a resource
 * Returns true if user is admin or owns the resource
 */
export const canAccessResource = (
  user: User,
  resourceOwnerId: string,
): boolean => {
  return permissionsService.canAccessResource(
    user.id,
    resourceOwnerId,
    user.role === "admin",
  );
};

/**
 * Helper function to filter items by user access
 * Admins see all items, regular users only see their own
 */
export function filterByUserAccess<T extends { userId: string }>(
  items: T[],
  user: User,
): T[] {
  if (user.role === "admin") {
    return items;
  }

  return items.filter((item) => item.userId === user.id);
}
