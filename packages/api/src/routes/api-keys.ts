import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "../auth.js";
import { logger } from "../utils/logger.js";
import type { User } from "../db/schema.js";

const app = new OpenAPIHono();

// Helper to check if user is admin
const isAdmin = (user: User): boolean => user.role === "admin";

// Response schemas
const apiKeySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(), // First few chars for display
  userId: z.string(),
  enabled: z.boolean(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

const apiKeyListSchema = z.array(apiKeySchema);

const apiKeyCreateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  expiresIn: z.number().int().positive().optional(), // Seconds until expiration
});

const apiKeyCreateResponseSchema = z.object({
  id: z.string(),
  key: z.string(), // Full key - only shown once!
  name: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

// ============== User Routes ==============

// GET /api-keys - List current user's API keys
const listApiKeysRoute = createRoute({
  method: "get",
  path: "/api-keys",
  tags: ["API Keys"],
  summary: "List your API keys",
  description:
    "Get a list of your own API keys (requires canManageApiKeys permission)",
  responses: {
    200: {
      description: "List of API keys",
      content: {
        "application/json": {
          schema: apiKeyListSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(listApiKeysRoute, async (c) => {
  try {
    const user = c.get("user") as User;

    // Use better-auth's server API to list keys for this user
    const keys = await auth.api.listApiKeys({
      headers: c.req.raw.headers,
    });

    // Filter to only show this user's keys (extra safety)
    const userKeys = (keys || []).filter(
      (key: { userId: string }) => key.userId === user.id,
    );

    const response = userKeys.map(
      (key: {
        id: string;
        name: string | null;
        start: string | null;
        userId: string;
        enabled: boolean;
        expiresAt: Date | null;
        createdAt: Date;
      }) => ({
        id: key.id,
        name: key.name,
        start: key.start,
        userId: key.userId,
        enabled: key.enabled,
        expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
        createdAt: new Date(key.createdAt).toISOString(),
      }),
    );

    return c.json(response, 200);
  } catch (error) {
    logger.error("[API Keys] Failed to list keys:", error);
    return c.json(
      {
        error: "Failed to list API keys",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// POST /api-keys - Create a new API key
const createApiKeyRoute = createRoute({
  method: "post",
  path: "/api-keys",
  tags: ["API Keys"],
  summary: "Create a new API key",
  description:
    "Create a new API key for yourself. The full key is only shown once!",
  request: {
    body: {
      content: {
        "application/json": {
          schema: apiKeyCreateRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description:
        "API key created - save the key now, it won't be shown again!",
      content: {
        "application/json": {
          schema: apiKeyCreateResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(createApiKeyRoute, async (c) => {
  try {
    const { name, expiresIn } = c.req.valid("json");

    logger.info(`[API Keys] Creating new API key: ${name}`);

    // Use better-auth's server API to create the key
    const result = await auth.api.createApiKey({
      headers: c.req.raw.headers,
      body: {
        name,
        expiresIn: expiresIn || undefined,
      },
    });

    logger.success(`[API Keys] Created API key: ${result.id}`);

    return c.json(
      {
        id: result.id,
        key: result.key, // Full key - only shown once!
        name: result.name,
        expiresAt: result.expiresAt
          ? new Date(result.expiresAt).toISOString()
          : null,
        createdAt: new Date(result.createdAt).toISOString(),
      },
      201,
    );
  } catch (error) {
    logger.error("[API Keys] Failed to create key:", error);
    return c.json(
      {
        error: "Failed to create API key",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// DELETE /api-keys/:id - Delete an API key
const deleteApiKeyRoute = createRoute({
  method: "delete",
  path: "/api-keys/{id}",
  tags: ["API Keys"],
  summary: "Delete an API key",
  description:
    "Delete an API key. Users can only delete their own keys, admins can delete any.",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    204: {
      description: "API key deleted",
    },
    403: {
      description: "Forbidden - cannot delete others' keys",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "API key not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(deleteApiKeyRoute, async (c) => {
  try {
    const user = c.get("user") as User;
    const { id } = c.req.valid("param");

    // Get the key to check ownership
    const key = await auth.api.getApiKey({
      headers: c.req.raw.headers,
      query: { id },
    });

    if (!key) {
      return c.json({ error: "API key not found" }, 404);
    }

    // Check ownership - users can only delete their own keys
    if (key.userId !== user.id && !isAdmin(user)) {
      return c.json({ error: "You can only delete your own API keys" }, 403);
    }

    // Delete the key
    await auth.api.deleteApiKey({
      headers: c.req.raw.headers,
      body: { keyId: id },
    });

    logger.info(`[API Keys] Deleted API key: ${id}`);

    return c.body(null, 204);
  } catch (error) {
    logger.error("[API Keys] Failed to delete key:", error);
    return c.json(
      {
        error: "Failed to delete API key",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// ============== Admin Routes ==============

// Extended schema for admin response with user info
const apiKeyWithUserSchema = apiKeySchema.extend({
  userName: z.string().nullable().optional(),
  userEmail: z.string().nullable().optional(),
});

// GET /api-keys/all - List all API keys (admin only)
const listAllApiKeysRoute = createRoute({
  method: "get",
  path: "/api-keys/all",
  tags: ["API Keys"],
  summary: "List all API keys (admin only)",
  description: "Get a list of all API keys for all users. Requires admin role.",
  responses: {
    200: {
      description: "List of all API keys",
      content: {
        "application/json": {
          schema: z.array(apiKeyWithUserSchema),
        },
      },
    },
    403: {
      description: "Forbidden - admin only",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(listAllApiKeysRoute, async (c) => {
  try {
    const user = c.get("user") as User;

    if (!isAdmin(user)) {
      return c.json({ error: "Admin access required" }, 403);
    }

    // Use Drizzle to query all API keys
    const { db } = await import("../db/index.js");
    const { apikey, user: userTable } = await import("../db/schema.js");
    const { eq, isNull } = await import("drizzle-orm");

    // Query all non-deleted API keys
    const allKeys = await db
      .select()
      .from(apikey)
      .where(isNull(apikey.deletedAt));

    // Get user info for each key
    const keysWithUsers = await Promise.all(
      allKeys.map(async (key) => {
        const userResult = await db
          .select({ name: userTable.name, email: userTable.email })
          .from(userTable)
          .where(eq(userTable.id, key.userId))
          .limit(1);

        const keyUser = userResult[0];

        return {
          id: key.id,
          name: key.name,
          start: key.start,
          userId: key.userId,
          enabled: key.enabled ?? true,
          expiresAt: key.expiresAt
            ? new Date(key.expiresAt).toISOString()
            : null,
          createdAt: new Date(key.createdAt).toISOString(),
          userName: keyUser?.name || null,
          userEmail: keyUser?.email || null,
        };
      }),
    );

    return c.json(keysWithUsers, 200);
  } catch (error) {
    logger.error("[API Keys] Failed to list all keys:", error);
    return c.json(
      {
        error: "Failed to list API keys",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;
