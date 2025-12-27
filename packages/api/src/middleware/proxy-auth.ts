import { createMiddleware } from "hono/factory";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, Next } from "hono";
import type { User } from "../db/schema.js";
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
 * Proxy Authentication Middleware
 *
 * SECURITY NOTES:
 * 1. This middleware ONLY processes web routes, NOT API routes (/api/*)
 * 2. It validates that the request comes from a configured trusted proxy IP
 * 3. It only authenticates pre-existing users (no auto-provisioning)
 * 4. If the header is present but invalid, it returns 401 (doesn't fall through)
 *
 * This middleware uses better-auth's proxy-auth plugin internally to ensure
 * proper session creation and cookie handling.
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
      // User not provisioned yet - fall through to normal auth flow
      // This lets them see the login page and OIDC login to get auto-provisioned
      console.log(
        `[Proxy Auth] User not found for header value: ${headerValue}, falling through to normal auth`,
      );
      return next();
    }

    // User found - create session using better-auth's plugin endpoint
    try {
      // Call the proxy-auth plugin endpoint to create the session properly
      // This uses better-auth's internal session management and cookie signing
      const result = await auth.api.signInWithProxy({
        body: {
          userId: foundUser.id,
          ipAddress: clientIP,
          userAgent: c.req.header("user-agent") || "",
        },
        returnHeaders: true,
      });

      // Forward the Set-Cookie headers from better-auth to our response
      const setCookieHeaders = result.headers?.getSetCookie?.();
      if (setCookieHeaders) {
        for (const cookie of setCookieHeaders) {
          c.header("Set-Cookie", cookie, { append: true });
        }
      }

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
