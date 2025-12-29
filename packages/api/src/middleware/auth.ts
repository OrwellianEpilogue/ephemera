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
 * Cross-request session cache
 * Caches session lookups by session token for a short period
 * to avoid redundant Better Auth calls during parallel requests
 */
interface CachedSession {
  user: User;
  expiresAt: number;
}

const SESSION_CACHE_TTL_MS = 5000; // 5 seconds
const sessionCache = new Map<string, CachedSession>();

// Periodic cleanup of expired cache entries (every 30 seconds)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of sessionCache) {
    if (value.expiresAt < now) {
      sessionCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug(
      `[PERF] Session cache cleanup: removed ${cleaned} expired entries`,
    );
  }
}, 30000);

/**
 * Extract session token from cookies
 * Better Auth uses 'better-auth.session_token' cookie
 */
function getSessionToken(c: {
  req: { raw: { headers: { get(name: string): string | null } } };
}): string | undefined {
  // Better Auth session cookie name - parse from raw request headers
  const cookieHeader = c.req.raw.headers.get("cookie");
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === "better-auth.session_token") {
      return rest.join("="); // Handle values that might contain '='
    }
  }
  return undefined;
}

/**
 * Middleware to require authentication
 * Validates session and attaches user to context
 * Uses multi-level caching:
 * 1. Request-scoped cache (same request, multiple middleware calls)
 * 2. Cross-request cache (parallel requests with same session token)
 */
export const requireAuth = createMiddleware(async (c, next) => {
  try {
    // Level 1: Request-scoped cache (same request)
    const existingUser = c.get("user");
    if (existingUser && c.get("sessionChecked")) {
      logger.debug(`[PERF] Auth session cache HIT (request-scoped)`);
      await next();
      return;
    }

    // Level 2: Cross-request cache (parallel requests)
    const sessionToken = getSessionToken(c);
    if (sessionToken) {
      const cached = sessionCache.get(sessionToken);
      if (cached && cached.expiresAt > Date.now()) {
        logger.debug(`[PERF] Auth session cache HIT (cross-request)`);
        c.set("user", cached.user);
        c.set("sessionChecked", true);
        await next();
        return;
      }
    }

    // Cache miss - fetch from Better Auth
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

    const user = session.user as User;

    // Cache the session for parallel requests
    if (sessionToken) {
      sessionCache.set(sessionToken, {
        user,
        expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
      });
    }

    // Attach user to context and mark session as checked
    c.set("user", user);
    c.set("sessionChecked", true);

    return await next();
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

  return await next();
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
    | "canManageApiKeys"
    | "canManageLists",
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
      return await next();
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

    return await next();
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
