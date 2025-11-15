import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { db } from "../db/index.js";
import { user, userPermissions } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { auth } from "../auth.js";

const app = new OpenAPIHono();

// Schemas
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: z.enum(["admin", "user"]),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  banExpiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const UserWithPermissionsSchema = UserSchema.extend({
  permissions: z
    .object({
      canDeleteDownloads: z.boolean(),
      canConfigureNotifications: z.boolean(),
      canManageRequests: z.boolean(),
      canAccessSettings: z.boolean(),
    })
    .nullable(),
});

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "user"]).default("user"),
  permissions: z
    .object({
      canDeleteDownloads: z.boolean().default(false),
      canConfigureNotifications: z.boolean().default(false),
      canManageRequests: z.boolean().default(false),
      canAccessSettings: z.boolean().default(false),
    })
    .optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "user"]).optional(),
  banned: z.boolean().optional(),
  banReason: z.string().nullable().optional(),
  banExpiresAt: z.string().nullable().optional(),
  permissions: z
    .object({
      canDeleteDownloads: z.boolean().optional(),
      canConfigureNotifications: z.boolean().optional(),
      canManageRequests: z.boolean().optional(),
      canAccessSettings: z.boolean().optional(),
    })
    .optional(),
});

// GET /users - List all users
const getUsersRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List all users",
  description: "Get a list of all users with their permissions (admin only)",
  responses: {
    200: {
      description: "List of users",
      content: {
        "application/json": {
          schema: z.array(UserWithPermissionsSchema),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(getUsersRoute, async (c) => {
  try {
    const users = await db.query.user.findMany({
      orderBy: [desc(user.createdAt)],
      with: {
        permissions: true,
      },
    });

    return c.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        image: u.image,
        role: u.role,
        banned: u.banned,
        banReason: u.banReason,
        banExpiresAt: u.banExpiresAt?.toISOString() || null,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        permissions: u.permissions
          ? {
              canDeleteDownloads: u.permissions.canDeleteDownloads,
              canConfigureNotifications:
                u.permissions.canConfigureNotifications,
              canManageRequests: u.permissions.canManageRequests,
              canAccessSettings: u.permissions.canAccessSettings,
            }
          : null,
      })),
      200,
    );
  } catch (error) {
    console.error("[Users] Error fetching users:", error);
    return c.json({ error: "Failed to fetch users" }, 500);
  }
});

// POST /users - Create new user
const createUserRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create new user",
  description: "Create a new user account (admin only)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateUserSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "User created",
      content: {
        "application/json": {
          schema: UserWithPermissionsSchema,
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(createUserRoute, async (c) => {
  const body = c.req.valid("json");

  try {
    // Create user via Better Auth
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
          name: body.name,
        }),
      },
    );

    const response = await auth.handler(signUpRequest);
    const result = await response.json();

    if (!response.ok || !result.user) {
      throw new Error(result.message || "Failed to create user");
    }

    const userId = result.user.id;

    // Update role if not default
    if (body.role === "admin") {
      await db.update(user).set({ role: "admin" }).where(eq(user.id, userId));
    }

    // Create permissions
    const permissionsData = body.permissions || {
      canDeleteDownloads: false,
      canConfigureNotifications: false,
      canManageRequests: false,
      canAccessSettings: false,
    };

    await db.insert(userPermissions).values({
      userId: userId,
      canDeleteDownloads: permissionsData.canDeleteDownloads,
      canConfigureNotifications: permissionsData.canConfigureNotifications,
      canManageRequests: permissionsData.canManageRequests,
      canAccessSettings: permissionsData.canAccessSettings,
    });

    // Fetch the created user with permissions
    const createdUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      with: {
        permissions: true,
      },
    });

    if (!createdUser) {
      throw new Error("User created but not found");
    }

    return c.json(
      {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        emailVerified: createdUser.emailVerified,
        image: createdUser.image,
        role: createdUser.role,
        banned: createdUser.banned,
        banReason: createdUser.banReason,
        banExpiresAt: createdUser.banExpiresAt?.toISOString() || null,
        createdAt: createdUser.createdAt.toISOString(),
        updatedAt: createdUser.updatedAt.toISOString(),
        permissions: createdUser.permissions
          ? {
              canDeleteDownloads: createdUser.permissions.canDeleteDownloads,
              canConfigureNotifications:
                createdUser.permissions.canConfigureNotifications,
              canManageRequests: createdUser.permissions.canManageRequests,
              canAccessSettings: createdUser.permissions.canAccessSettings,
            }
          : null,
      },
      201,
    );
  } catch (error) {
    console.error("[Users] Error creating user:", error);
    return c.json({ error: String(error) }, 500);
  }
});

// PATCH /users/:id - Update user
const updateUserRoute = createRoute({
  method: "patch",
  path: "/{id}",
  summary: "Update user",
  description: "Update user details, role, or permissions (admin only)",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateUserSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "User updated",
      content: {
        "application/json": {
          schema: UserWithPermissionsSchema,
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(updateUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  try {
    // Check if user exists
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!existingUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Update user fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) updateData.name = body.name;
    if (body.email) updateData.email = body.email;
    if (body.role) updateData.role = body.role;
    if (body.banned !== undefined) updateData.banned = body.banned;
    if (body.banReason !== undefined) updateData.banReason = body.banReason;
    if (body.banExpiresAt !== undefined) {
      updateData.banExpiresAt = body.banExpiresAt
        ? new Date(body.banExpiresAt)
        : null;
    }

    await db.update(user).set(updateData).where(eq(user.id, id));

    // Update permissions if provided
    if (body.permissions) {
      const existingPermissions = await db.query.userPermissions.findFirst({
        where: eq(userPermissions.userId, id),
      });

      const permissionsUpdate: Record<string, boolean> = {};
      if (body.permissions.canDeleteDownloads !== undefined)
        permissionsUpdate.canDeleteDownloads =
          body.permissions.canDeleteDownloads;
      if (body.permissions.canConfigureNotifications !== undefined)
        permissionsUpdate.canConfigureNotifications =
          body.permissions.canConfigureNotifications;
      if (body.permissions.canManageRequests !== undefined)
        permissionsUpdate.canManageRequests =
          body.permissions.canManageRequests;
      if (body.permissions.canAccessSettings !== undefined)
        permissionsUpdate.canAccessSettings =
          body.permissions.canAccessSettings;

      if (existingPermissions) {
        await db
          .update(userPermissions)
          .set(permissionsUpdate)
          .where(eq(userPermissions.userId, id));
      } else {
        await db.insert(userPermissions).values({
          userId: id,
          canDeleteDownloads: permissionsUpdate.canDeleteDownloads || false,
          canConfigureNotifications:
            permissionsUpdate.canConfigureNotifications || false,
          canManageRequests: permissionsUpdate.canManageRequests || false,
          canAccessSettings: permissionsUpdate.canAccessSettings || false,
        });
      }
    }

    // Fetch updated user
    const updatedUser = await db.query.user.findFirst({
      where: eq(user.id, id),
      with: {
        permissions: true,
      },
    });

    if (!updatedUser) {
      throw new Error("User updated but not found");
    }

    return c.json(
      {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        image: updatedUser.image,
        role: updatedUser.role,
        banned: updatedUser.banned,
        banReason: updatedUser.banReason,
        banExpiresAt: updatedUser.banExpiresAt?.toISOString() || null,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
        permissions: updatedUser.permissions
          ? {
              canDeleteDownloads: updatedUser.permissions.canDeleteDownloads,
              canConfigureNotifications:
                updatedUser.permissions.canConfigureNotifications,
              canManageRequests: updatedUser.permissions.canManageRequests,
              canAccessSettings: updatedUser.permissions.canAccessSettings,
            }
          : null,
      },
      200,
    );
  } catch (error) {
    console.error("[Users] Error updating user:", error);
    return c.json({ error: String(error) }, 500);
  }
});

// DELETE /users/:id - Delete user
const deleteUserRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete user",
  description: "Delete a user account (admin only)",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: "User deleted",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(deleteUserRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    // Check if user exists
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!existingUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Delete permissions first (foreign key constraint)
    await db.delete(userPermissions).where(eq(userPermissions.userId, id));

    // Delete user
    await db.delete(user).where(eq(user.id, id));

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("[Users] Error deleting user:", error);
    return c.json({ error: String(error) }, 500);
  }
});

export default app;
