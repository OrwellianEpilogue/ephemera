import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { ssoProvider, user, account } from "./db/schema.js";
import { booklorePlugin } from "./auth/plugins/booklore-plugin.js";
import { calibrePlugin } from "./auth/plugins/calibre-plugin.js";

// Load SSO provider IDs at startup for account linking
// New providers added after startup will be dynamically handled via the before hook
// Wrapped in try-catch for initial setup when tables don't exist yet
let loadedSsoProviderIds: string[] = [];
try {
  loadedSsoProviderIds = await db
    .select({ providerId: ssoProvider.providerId })
    .from(ssoProvider)
    .then((providers) => providers.map((p) => p.providerId));

  console.log(
    "[Auth] Loaded SSO providers for account linking:",
    loadedSsoProviderIds,
  );
} catch {
  // Tables don't exist yet (initial setup or migration)
  console.log("[Auth] SSO provider table not ready, skipping provider load");
}

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.BASE_URL || "http://localhost:8286",
  trustedOrigins: [
    "http://localhost:5222", // Vite dev server (primary)
    "http://localhost:5223", // Vite dev server (backup port)
    "http://localhost:8286", // Production (same origin)
  ],

  // Cookie configuration for cross-origin setup (dev) and same-origin (prod)
  cookie: {
    sameSite: "lax", // Allow cookies to be sent on redirects (critical for OIDC)
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    path: "/",
    // Don't set domain - let browser handle it (works for both localhost and production)
  },

  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),

  // Basic email/password auth
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  // Account linking - SSO providers loaded at startup, dynamically added via before hook
  account: {
    accountLinking: {
      enabled: true,
      // Include all SSO providers loaded at startup for account linking
      // New providers added after startup are handled via the before hook
      trustedProviders: ["credential", ...loadedSsoProviderIds],
    },
  },

  // Before hook to dynamically trust SSO providers
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Only process SSO callbacks
      if (!ctx.path.startsWith("/sso/callback")) {
        return;
      }

      // Extract provider ID from path: /sso/callback/{providerId}
      const pathParts = ctx.path.split("/");
      const providerId = pathParts[pathParts.length - 1];

      if (providerId && providerId !== "callback") {
        // Check if this provider exists in our database
        const providerExists = await db
          .select({ id: ssoProvider.id })
          .from(ssoProvider)
          .where(eq(ssoProvider.providerId, providerId))
          .limit(1);

        if (providerExists.length > 0) {
          // Dynamically add this provider to trustedProviders for this request
          // This handles providers added after server startup
          const options = ctx.context.options;

          // Ensure account config exists
          if (!options.account) {
            (options as Record<string, unknown>).account = {};
          }
          const accountConfig = options.account as Record<string, unknown>;

          // Ensure accountLinking config exists
          if (!accountConfig.accountLinking) {
            accountConfig.accountLinking = { enabled: true };
          }
          const linkingConfig = accountConfig.accountLinking as Record<
            string,
            unknown
          >;

          // Ensure trustedProviders array exists
          if (!Array.isArray(linkingConfig.trustedProviders)) {
            linkingConfig.trustedProviders = ["credential"];
          }
          const trustedProviders = linkingConfig.trustedProviders as string[];

          // Add provider if not already trusted (handles newly added providers)
          if (!trustedProviders.includes(providerId)) {
            trustedProviders.push(providerId);
          }
        }
      }
    }),
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    // Cookie cache disabled - causes stale session data after OIDC redirect
    // React Query's 30s cache provides sufficient performance optimization
  },

  // Rate limiting
  rateLimit: {
    enabled: true,
    window: 60, // 1 minute
    max: 10, // 10 requests per minute
  },

  // Advanced configuration
  advanced: {
    database: {
      generateId: () => {
        // Use crypto.randomUUID for better IDs
        return crypto.randomUUID();
      },
    },
  },

  // Database hooks for SSO auto-provisioning control
  databaseHooks: {
    account: {
      create: {
        before: async (newAccount) => {
          // Only check SSO providers (not "credential" which is email/password)
          if (
            !newAccount.providerId ||
            newAccount.providerId === "credential"
          ) {
            return;
          }

          // Check if user already has any accounts (meaning they're an existing user)
          const existingAccounts = await db
            .select()
            .from(account)
            .where(eq(account.userId, newAccount.userId))
            .limit(1);

          // If user already has accounts, they're an existing user - allow SSO linking
          if (existingAccounts.length > 0) {
            return;
          }

          // User has no accounts - this is a new user being created via SSO
          // Check if auto-provisioning is allowed for this provider
          const providerResult = await db
            .select()
            .from(ssoProvider)
            .where(eq(ssoProvider.providerId, newAccount.providerId))
            .limit(1);

          if (providerResult.length === 0) {
            throw new APIError("FORBIDDEN", {
              message: "SSO provider not configured",
            });
          }

          const providerConfig = providerResult[0];

          if (!providerConfig.allowAutoProvision) {
            // Clean up the orphaned user that was created before this account
            console.log(
              "[SSO] Auto-provisioning disabled - cleaning up user:",
              newAccount.userId,
            );
            await db.delete(user).where(eq(user.id, newAccount.userId));

            throw new APIError("FORBIDDEN", {
              message:
                "Account does not exist. Please contact an administrator to create your account.",
            });
          }
        },
      },
    },
  },

  plugins: [
    // Admin plugin for role-based access
    admin({
      defaultRole: "user",
    }),

    // API Key plugin for 3rd party tool authentication
    apiKey({
      enableSessionForAPIKeys: true, // Creates session from valid API key
      apiKeyHeaders: ["x-api-key"], // Standard header for API key
      rateLimit: {
        enabled: false, // No rate limiting for API keys
      },
      keyExpiration: {
        defaultExpiresIn: null, // Optional expiration (users can set it when creating)
        disableCustomExpiresTime: false, // Allow users to set custom expiration
      },
    }),

    // Custom credential plugins
    booklorePlugin,
    calibrePlugin,

    // SSO plugin for database-stored OIDC providers
    sso({
      organizationProvisioning: {
        disabled: true, // We don't need organization features
        defaultRole: "member",
      },
      defaultOverrideUserInfo: true, // Update user info on each login
      trustEmailVerified: true, // Trust email verification from OIDC providers for account linking
      // Note: provisionUser callback is kept as secondary check (databaseHooks is primary)
      provisionUser: async ({ user: ssoUser, provider: providerInfo }) => {
        // Look up the provider in our database
        const providerResult = await db
          .select()
          .from(ssoProvider)
          .where(eq(ssoProvider.providerId, providerInfo.providerId))
          .limit(1);

        if (providerResult.length === 0) {
          throw new APIError("FORBIDDEN", {
            message: "SSO provider not found",
          });
        }

        const providerConfig = providerResult[0];

        // If auto-provisioning is disabled, check if user already exists
        if (!providerConfig.allowAutoProvision) {
          const existingUser = await db
            .select()
            .from(user)
            .where(eq(user.email, ssoUser.email))
            .limit(1);

          if (existingUser.length === 0) {
            throw new APIError("FORBIDDEN", {
              message:
                "Account does not exist. Please contact an administrator to create your account.",
            });
          }
        }
      },
    }),
  ],
});

export type Auth = typeof auth;
