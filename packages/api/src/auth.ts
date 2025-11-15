import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import crypto from "node:crypto";
import { db } from "./db/index.js";
import { booklorePlugin } from "./auth/plugins/booklore-plugin.js";
import { calibrePlugin } from "./auth/plugins/calibre-plugin.js";

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

  plugins: [
    // Admin plugin for role-based access
    admin({
      defaultRole: "user",
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
    }),
  ],
});

export type Auth = typeof auth;
