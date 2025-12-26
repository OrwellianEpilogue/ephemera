import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { db } from "../db/index.js";
import { appConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { setupSecurityService } from "../services/setup-security.js";

const SETUP_TOKEN_COOKIE = "ephemera-setup-token";

// Helper to check if client has valid setup token
function hasValidSetupToken(c: Context): boolean {
  if (!setupSecurityService.requiresSetupKey()) return true;
  const token = getCookie(c, SETUP_TOKEN_COOKIE);
  return setupSecurityService.isTokenValid(token);
}

const app = new OpenAPIHono();

// Helper to check if setup is already complete
async function isSetupAlreadyComplete(): Promise<boolean> {
  try {
    const config = await db.query.appConfig.findFirst({
      where: eq(appConfig.id, 1),
    });
    return config?.isSetupComplete ?? false;
  } catch {
    return false;
  }
}

// Schema for setup status response
const SetupStatusSchema = z.object({
  isSetupComplete: z.boolean(),
  requiresSetupKey: z.boolean(),
  setupKeyValidated: z.boolean(),
});

// Schema for env defaults response
const EnvDefaultsSchema = z.object({
  searcherBaseUrl: z.string().nullable(),
  searcherApiKey: z.string().nullable(),
  quickBaseUrl: z.string().nullable(),
  downloadFolder: z.string().nullable(),
  ingestFolder: z.string().nullable(),
});

// Schema for step 1: System configuration
const Step1Schema = z.object({
  searcherBaseUrl: z.string().url(),
  searcherApiKey: z.string().optional(),
  quickBaseUrl: z.string().url().or(z.literal("")).optional(),
  downloadFolder: z.string(),
  ingestFolder: z.string(),
});

// Schema for step 2: Admin user creation
const Step2Schema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

// GET /setup/status - Check if setup is complete
const getStatusRoute = createRoute({
  method: "get",
  path: "/status",
  summary: "Get setup status",
  description: "Check if initial setup has been completed",
  responses: {
    200: {
      description: "Setup status",
      content: {
        "application/json": {
          schema: SetupStatusSchema,
        },
      },
    },
  },
});

app.openapi(getStatusRoute, async (c) => {
  try {
    const config = await db.query.appConfig.findFirst({
      where: eq(appConfig.id, 1),
    });

    return c.json({
      isSetupComplete: config?.isSetupComplete ?? false,
      requiresSetupKey: setupSecurityService.requiresSetupKey(),
      setupKeyValidated: hasValidSetupToken(c),
    });
  } catch (error) {
    console.error("[Setup Status] Error:", error);
    return c.json({
      isSetupComplete: false,
      requiresSetupKey: setupSecurityService.requiresSetupKey(),
      setupKeyValidated: hasValidSetupToken(c),
    });
  }
});

// GET /setup/defaults - Get environment variable defaults
const getDefaultsRoute = createRoute({
  method: "get",
  path: "/defaults",
  summary: "Get environment defaults",
  description:
    "Returns values from environment variables that can pre-populate the setup form",
  responses: {
    200: {
      description: "Environment defaults",
      content: {
        "application/json": {
          schema: EnvDefaultsSchema,
        },
      },
    },
    401: {
      description: "Setup key validation required",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    403: {
      description: "Setup already complete",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(getDefaultsRoute, async (c) => {
  // Block access if setup is already complete
  if (await isSetupAlreadyComplete()) {
    return c.json({ error: "Setup already complete" }, 403);
  }

  // Security: Require valid setup token if key protection is enabled
  if (!hasValidSetupToken(c)) {
    return c.json({ error: "Setup key validation required" }, 401);
  }

  // Read from deprecated env vars to pre-populate setup wizard
  return c.json(
    {
      searcherBaseUrl: process.env.AA_BASE_URL || null,
      searcherApiKey: process.env.AA_API_KEY || null,
      quickBaseUrl: process.env.LG_BASE_URL || null,
      downloadFolder: process.env.DOWNLOAD_FOLDER || null,
      ingestFolder: process.env.INGEST_FOLDER || null,
    },
    200,
  );
});

// Schema for setup key validation
const SetupKeySchema = z.object({
  key: z.string().min(1),
});

// POST /setup/validate-key - Validate the setup key
const validateKeyRoute = createRoute({
  method: "post",
  path: "/validate-key",
  summary: "Validate setup key",
  description: "Validates the setup key for existing installs",
  request: {
    body: {
      content: {
        "application/json": {
          schema: SetupKeySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Key validated",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    400: {
      description: "Key not required",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    401: {
      description: "Invalid key",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(validateKeyRoute, async (c) => {
  if (!setupSecurityService.requiresSetupKey()) {
    return c.json({ error: "Setup key not required" }, 400);
  }

  const { key } = c.req.valid("json");

  if (!setupSecurityService.validateKey(key)) {
    return c.json({ error: "Invalid setup key" }, 401);
  }

  // Generate and set validation token cookie
  const token = setupSecurityService.generateValidationToken();
  setCookie(c, SETUP_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 60, // 30 minutes
  });

  return c.json({ success: true }, 200);
});

// POST /setup/step1 - Save system configuration
const postStep1Route = createRoute({
  method: "post",
  path: "/step1",
  summary: "Save system configuration",
  description: "Save base URLs, folders, and other system settings",
  request: {
    body: {
      content: {
        "application/json": {
          schema: Step1Schema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Configuration saved",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    401: {
      description: "Setup key validation required",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    403: {
      description: "Setup already complete",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Error saving configuration",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean(), error: z.string() }),
        },
      },
    },
  },
});

app.openapi(postStep1Route, async (c) => {
  // Block access if setup is already complete
  if (await isSetupAlreadyComplete()) {
    return c.json({ error: "Setup already complete" }, 403);
  }

  // Security: Require valid setup token if key protection is enabled
  if (!hasValidSetupToken(c)) {
    return c.json({ error: "Setup key validation required" }, 401);
  }

  const body = c.req.valid("json");

  try {
    // Check if config exists
    const existingConfig = await db.query.appConfig.findFirst({
      where: eq(appConfig.id, 1),
    });

    if (existingConfig) {
      // Update existing config
      await db
        .update(appConfig)
        .set({
          searcherBaseUrl: body.searcherBaseUrl,
          searcherApiKey: body.searcherApiKey || null,
          quickBaseUrl:
            body.quickBaseUrl && body.quickBaseUrl.trim() !== ""
              ? body.quickBaseUrl
              : null,
          downloadFolder: body.downloadFolder,
          ingestFolder: body.ingestFolder,
          updatedAt: new Date(),
        })
        .where(eq(appConfig.id, 1));
    } else {
      // Create new config
      await db.insert(appConfig).values({
        id: 1,
        isSetupComplete: false,
        authMethod: null, // Auth methods are configured in Settings, not during setup
        searcherBaseUrl: body.searcherBaseUrl,
        searcherApiKey: body.searcherApiKey || null,
        quickBaseUrl:
          body.quickBaseUrl && body.quickBaseUrl.trim() !== ""
            ? body.quickBaseUrl
            : null,
        downloadFolder: body.downloadFolder,
        ingestFolder: body.ingestFolder,
        retryAttempts: 3,
        requestTimeout: 30000,
        searchCacheTtl: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("[Setup Step 1] Error:", error);
    return c.json(
      { success: false, error: "Failed to save configuration" },
      500,
    );
  }
});

// POST /setup/step2 - Create admin user
const postStep2Route = createRoute({
  method: "post",
  path: "/step2",
  summary: "Create admin user",
  description: "Create the first admin user account",
  request: {
    body: {
      content: {
        "application/json": {
          schema: Step2Schema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Admin user created",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    401: {
      description: "Setup key validation required",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    403: {
      description: "Setup already complete",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Error creating admin user",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean(), error: z.string() }),
        },
      },
    },
  },
});

app.openapi(postStep2Route, async (c) => {
  // Block access if setup is already complete
  if (await isSetupAlreadyComplete()) {
    return c.json({ error: "Setup already complete" }, 403);
  }

  // Security: Require valid setup token if key protection is enabled
  if (!hasValidSetupToken(c)) {
    return c.json({ error: "Setup key validation required" }, 401);
  }

  const body = c.req.valid("json");

  try {
    const { auth } = await import("../auth.js");
    const { user, userPermissions } = await import("../db/schema.js");

    // Create admin user via Better Auth API
    const signUpRequest = new globalThis.Request(
      "http://localhost/api/auth/sign-up/email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: body.email,
          password: body.password,
          name: body.username,
        }),
      },
    );

    const response = await auth.handler(signUpRequest);
    const result = await response.json();

    if (!response.ok || !result.user) {
      throw new Error(result.message || "Failed to create user");
    }

    const userId = result.user.id;

    // Update user role to admin
    await db.update(user).set({ role: "admin" }).where(eq(user.id, userId));

    // Create admin permissions (all permissions enabled)
    await db.insert(userPermissions).values({
      userId: userId,
      canDeleteDownloads: true,
      canConfigureNotifications: true,
      canManageRequests: true,
      canConfigureApp: true,
      canConfigureIntegrations: true,
      canConfigureEmail: true,
      canSeeDownloadOwner: true,
      canManageApiKeys: true,
    });

    // Migrate any orphan email recipients to the new admin user
    const { emailSettingsService } = await import(
      "../services/email-settings.js"
    );
    await emailSettingsService.migrateOrphanRecipients(userId);

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("[Setup Step 2] Error:", error);
    // Provide user-friendly error message without exposing internal details
    const message =
      error instanceof Error && error.message.includes("UNIQUE constraint")
        ? "A user with this email already exists"
        : "Failed to create admin user";
    return c.json({ success: false, error: message }, 500);
  }
});

// POST /setup/complete - Mark setup as complete
const postCompleteRoute = createRoute({
  method: "post",
  path: "/complete",
  summary: "Complete setup",
  description: "Mark the initial setup as complete",
  responses: {
    200: {
      description: "Setup completed",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    401: {
      description: "Setup key validation required",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    403: {
      description: "Setup already complete",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Error completing setup",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean(), error: z.string() }),
        },
      },
    },
  },
});

app.openapi(postCompleteRoute, async (c) => {
  // Block access if setup is already complete
  if (await isSetupAlreadyComplete()) {
    return c.json({ error: "Setup already complete" }, 403);
  }

  // Security: Require valid setup token if key protection is enabled
  if (!hasValidSetupToken(c)) {
    return c.json({ error: "Setup key validation required" }, 401);
  }

  try {
    await db
      .update(appConfig)
      .set({
        isSetupComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(appConfig.id, 1));

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("[Setup Complete] Error:", error);
    return c.json({ success: false, error: "Failed to complete setup" }, 500);
  }
});

export default app;
