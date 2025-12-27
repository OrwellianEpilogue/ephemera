import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin, User } from "better-auth";
import { z } from "zod";

/**
 * Proxy Authentication Plugin for Better Auth
 *
 * This plugin provides a proper endpoint for creating sessions
 * for users authenticated via a reverse proxy (e.g., Authelia, Authentik).
 *
 * The middleware validates the proxy header and trusted IP, then calls
 * this plugin's endpoint to create the session properly using better-auth's
 * internal mechanisms.
 */
export const proxyAuthPlugin = () => {
  return {
    id: "proxy-auth",
    endpoints: {
      /**
       * Create a session for a user authenticated via proxy header
       * This endpoint should only be called internally by the proxy-auth middleware
       * after it has validated the request comes from a trusted proxy.
       */
      signInWithProxy: createAuthEndpoint(
        "/proxy-auth/sign-in",
        {
          method: "POST",
          body: z.object({
            userId: z.string(),
            ipAddress: z.string().optional(),
            userAgent: z.string().optional(),
          }),
          metadata: {
            // Mark this as an internal endpoint - not for public use
            isAction: false,
            openapi: {
              description: "Internal endpoint for proxy authentication",
              responses: {
                200: {
                  description: "Session created successfully",
                },
              },
            },
          },
        },
        async (ctx) => {
          const { userId, ipAddress, userAgent } = ctx.body;

          // Look up the user
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!user) {
            throw ctx.error("NOT_FOUND", {
              message: "User not found",
            });
          }

          // Check if user is banned
          if ((user as User & { banned?: boolean }).banned) {
            throw ctx.error("FORBIDDEN", {
              message: "User is banned",
            });
          }

          // Create session using better-auth's internal adapter
          const session = await ctx.context.internalAdapter.createSession(
            userId,
            false, // dontRememberMe - false means normal session duration
            {
              ipAddress: ipAddress || "",
              userAgent: userAgent || "",
            },
          );

          // Set the session cookie using better-auth's proper mechanism
          await setSessionCookie(ctx, {
            session,
            user: user as User,
          });

          return ctx.json({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};
