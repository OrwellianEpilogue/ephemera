import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { db } from "../db/index.js";
import { appConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";

const app = new OpenAPIHono();

// Schema for setup status response
const SetupStatusSchema = z.object({
  isSetupComplete: z.boolean(),
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
    });
  } catch (error) {
    console.error("[Setup Status] Error:", error);
    return c.json({
      isSetupComplete: false,
    });
  }
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
    return c.json({ success: false, error: String(error) }, 500);
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

    // Create admin permissions
    await db.insert(userPermissions).values({
      userId: userId,
      canDeleteDownloads: true,
      canConfigureNotifications: true,
      canManageRequests: true,
      canAccessSettings: true,
    });

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("[Setup Step 2] Error:", error);
    return c.json({ success: false, error: String(error) }, 500);
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
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export default app;
