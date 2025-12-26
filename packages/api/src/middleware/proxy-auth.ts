import { createMiddleware } from "hono/factory";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, Next } from "hono";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { session, type User } from "../db/schema.js";
import { proxyAuthSettingsService } from "../services/proxy-auth-settings.js";
import { auth } from "../auth.js";

/**
 * Get the direct connection IP (the proxy's IP)
 * We validate the proxy itself, not X-Forwarded-For headers
 * This prevents spoofing - only the configured proxy should be able to send auth headers
 */
function getDirectConnectionIP(c: Context): string {
  // Use Hono's getConnInfo for proper socket access in Node.js
  const connInfo = getConnInfo(c);
  const remoteAddress = connInfo?.remote?.address || "";

  // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1)
  if (remoteAddress.startsWith("::ffff:")) {
    return remoteAddress.substring(7);
  }

  return remoteAddress;
}

/**
 * Create a session for a user authenticated via proxy header
 * Creates a better-auth compatible session with cookie
 */
async function createProxySession(
  foundUser: User,
  c: Context,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(session).values({
    id: sessionId,
    token,
    userId: foundUser.id,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: getDirectConnectionIP(c),
    userAgent: c.req.header("user-agent") || null,
  });

  console.log(
    `[Proxy Auth] Created session for user: ${foundUser.email} (${foundUser.id})`,
  );

  return token;
}

/**
 * Proxy Authentication Middleware
 *
 * SECURITY NOTES:
 * 1. This middleware ONLY processes web routes, NOT API routes (/api/*)
 * 2. It validates that the request comes from a configured trusted proxy IP
 * 3. It only authenticates pre-existing users (no auto-provisioning)
 * 4. If the header is present but invalid, it returns 401 (doesn't fall through)
 *
 * This middleware should be applied BEFORE the auth routes in the middleware chain.
 */
export const proxyAuthMiddleware = createMiddleware(
  async (c: Context, next: Next) => {
    const path = c.req.path;

    // CRITICAL SECURITY: Never process proxy auth for API routes
    // This prevents CVE-2024-35184 style vulnerabilities (like paperless-ngx had)
    if (path.startsWith("/api/")) {
      return next();
    }

    // Get settings
    const settings = await proxyAuthSettingsService.getSettings();

    // If proxy auth is not enabled, skip
    if (!settings.enabled) {
      return next();
    }

    // Get the auth header value
    const headerValue = c.req.header(settings.headerName);

    // No header present - fall through to normal auth flow
    if (!headerValue) {
      return next();
    }

    // SECURITY: Validate that request comes from a trusted proxy
    const clientIP = getDirectConnectionIP(c);
    if (
      !proxyAuthSettingsService.isIPTrusted(clientIP, settings.trustedProxies)
    ) {
      console.warn(
        `[Proxy Auth] SECURITY: Untrusted IP ${clientIP} attempted header auth with header: ${settings.headerName}`,
      );
      // Don't reveal that we detected the attempt - just ignore the header
      return next();
    }

    // Check if user already has a valid session
    // This avoids creating a new session on every request
    try {
      const existingSession = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (existingSession?.user) {
        // Session already exists, set user in context and continue
        c.set("user", existingSession.user as User);
        return next();
      }
    } catch {
      // No valid session, continue with header auth
    }

    // Look up the user (NO auto-provisioning)
    const foundUser = await proxyAuthSettingsService.findUserByHeader(
      headerValue,
      settings.userIdentifier,
    );

    if (!foundUser) {
      // User doesn't exist or is banned - return 401
      // Important: Don't leak whether user exists vs auth failed
      console.warn(
        `[Proxy Auth] Authentication failed for header value: ${headerValue} (user not found or banned)`,
      );
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required",
        },
        401,
      );
    }

    // User found - create session and set cookie
    try {
      const token = await createProxySession(foundUser, c);

      // Set the session cookie (matching better-auth's cookie settings)
      c.header(
        "Set-Cookie",
        `better-auth.session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
      );

      // Set user in context for downstream handlers
      c.set("user", foundUser);

      console.log(
        `[Proxy Auth] Authenticated user via header: ${foundUser.email} from IP ${clientIP}`,
      );

      return next();
    } catch (error) {
      console.error("[Proxy Auth] Error creating session:", error);
      return c.json(
        {
          error: "Authentication failed",
          message: "Failed to create session",
        },
        401,
      );
    }
  },
);

/**
 * Web-only middleware wrapper
 * Ensures a middleware only runs for non-API web routes
 */
export const webOnlyMiddleware = (
  middleware: ReturnType<typeof createMiddleware>,
) => {
  return createMiddleware(async (c: Context, next: Next) => {
    // Skip API routes
    if (c.req.path.startsWith("/api/")) {
      return next();
    }
    return middleware(c, next);
  });
};
