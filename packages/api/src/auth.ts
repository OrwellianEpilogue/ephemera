import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { ssoProvider, user, account } from "./db/schema.js";
import { booklorePlugin } from "./auth/plugins/booklore-plugin.js";
import { calibrePlugin } from "./auth/plugins/calibre-plugin.js";
import { proxyAuthPlugin } from "./auth/plugins/proxy-auth-plugin.js";
import { permissionsService } from "./services/permissions.js";

/**
 * Decode JWT payload without signature verification
 * (signature is already verified by better-auth)
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {};
    }
    // Base64URL decode the payload (second part)
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

// Get or generate persistent auth secret
// Priority: BETTER_AUTH_SECRET env var > persisted secret file > generate new
function getAuthSecret(): string {
  // 1. Check environment variable first
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  // 2. Try to read from persisted file
  const dbPath = process.env.DB_PATH || "./data/database.db";
  const dataDir = dirname(dbPath);
  const secretPath = join(dataDir, ".auth-secret");

  try {
    if (existsSync(secretPath)) {
      const secret = readFileSync(secretPath, "utf-8").trim();
      if (secret.length >= 32) {
        return secret;
      }
    }
  } catch {
    // File doesn't exist or can't be read, will generate new
  }

  // 3. Generate new secret and persist it
  const newSecret = crypto.randomBytes(32).toString("hex");
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(secretPath, newSecret, { mode: 0o600 }); // Read/write owner only
    console.log("[Auth] Generated and persisted new auth secret");
  } catch (error) {
    console.warn("[Auth] Could not persist auth secret:", error);
    console.warn(
      "[Auth] Sessions will be invalidated on restart. Set BETTER_AUTH_SECRET env var for persistence.",
    );
  }

  return newSecret;
}

const authSecret = getAuthSecret();

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

// Build trusted origins from environment
// Includes: dev servers, BASE_URL, and any additional ALLOWED_ORIGINS
function buildTrustedOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:5222", // Vite dev server (primary)
    "http://localhost:5223", // Vite dev server (backup port)
    "http://localhost:8286", // Default production port
  ]);

  // Add BASE_URL if configured
  if (process.env.BASE_URL) {
    origins.add(process.env.BASE_URL);
    // Also add without trailing slash if present
    origins.add(process.env.BASE_URL.replace(/\/$/, ""));
  }

  // Add any additional allowed origins (comma-separated)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  return [...origins];
}

const trustedOrigins = buildTrustedOrigins();
console.log("[Auth] Trusted origins:", trustedOrigins);

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.BASE_URL || "http://localhost:8286",
  trustedOrigins,
  secret: authSecret,

  // Cookie configuration for cross-origin setup (dev) and same-origin (prod)
  cookie: {
    sameSite: "lax", // Allow cookies to be sent on redirects (critical for OIDC)
    secure: process.env.NODE_ENV === "production", // Require HTTPS in production
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
  rateLimit: {
    enabled: false,
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

    // Proxy authentication plugin (for reverse proxy header auth)
    proxyAuthPlugin(),

    // SSO plugin for database-stored OIDC providers
    sso({
      organizationProvisioning: {
        disabled: true, // We don't need organization features
        defaultRole: "member",
      },
      defaultOverrideUserInfo: true, // Update user info on each login
      trustEmailVerified: true, // Trust email verification from OIDC providers for account linking
      // Note: provisionUser callback is kept as secondary check (databaseHooks is primary)
      provisionUser: async ({
        user: ssoUser,
        provider: providerInfo,
        token,
      }) => {
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

        // Get the current user from database to check/update role
        const currentUserResult = await db
          .select()
          .from(user)
          .where(eq(user.email, ssoUser.email))
          .limit(1);

        if (currentUserResult.length === 0) {
          // User doesn't exist yet - will be created by better-auth
          // Permissions will be created on first access via getPermissions()
          return;
        }

        const currentUser = currentUserResult[0];

        // Sync admin role from OIDC group claims (if configured)
        if (providerConfig.adminGroupValue && token?.idToken) {
          const idToken = decodeJwtPayload(token.idToken);
          const groupClaim = providerConfig.groupClaimName || "groups";
          const adminGroup = providerConfig.adminGroupValue;

          const groups = idToken[groupClaim];
          const groupArray = Array.isArray(groups)
            ? groups
            : groups
              ? [groups]
              : [];
          const hasAdminGroup = groupArray.includes(adminGroup);

          // Sync role with IdP (upgrade or downgrade)
          const newRole = hasAdminGroup ? "admin" : "user";
          if (currentUser.role !== newRole) {
            await db
              .update(user)
              .set({ role: newRole })
              .where(eq(user.id, currentUser.id));
            console.log(
              `[SSO] Updated user ${ssoUser.email} role to ${newRole} based on group claims`,
            );
          }
        }

        // Ensure permissions exist (creates defaults if not present)
        // Use provider-specific defaults if configured
        if (providerConfig.defaultPermissions) {
          try {
            const providerDefaults = JSON.parse(
              providerConfig.defaultPermissions,
            );
            await permissionsService.getPermissions(
              currentUser.id,
              providerDefaults,
            );
          } catch (e) {
            console.error(
              "[SSO] Failed to parse provider default permissions:",
              e,
            );
            await permissionsService.getPermissions(currentUser.id);
          }
        } else {
          await permissionsService.getPermissions(currentUser.id);
        }
      },
    }),
  ],
});

export type Auth = typeof auth;
