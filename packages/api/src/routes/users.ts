import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { db } from "../db/index.js";
import { user, userPermissions, account } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { auth } from "../auth.js";
import type { User } from "../db/schema.js";

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
      canConfigureApp: z.boolean(),
      canConfigureIntegrations: z.boolean(),
      canConfigureEmail: z.boolean(),
      canSeeDownloadOwner: z.boolean(),
    })
    .nullable(),
  hasPassword: z.boolean(),
  hasOIDC: z.boolean(),
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
      canConfigureApp: z.boolean().default(false),
      canConfigureIntegrations: z.boolean().default(false),
      canConfigureEmail: z.boolean().default(false),
      canSeeDownloadOwner: z.boolean().default(false),
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
      canConfigureApp: z.boolean().optional(),
      canConfigureIntegrations: z.boolean().optional(),
      canConfigureEmail: z.boolean().optional(),
      canSeeDownloadOwner: z.boolean().optional(),
    })
    .optional(),
});

// Schema for current user response
const CurrentUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  hasPassword: z.boolean(),
  hasOIDC: z.boolean(),
});

// Schema for updating own profile
const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

// Schema for admin password reset
const SetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
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
        accounts: true,
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
              canConfigureApp: u.permissions.canConfigureApp,
              canConfigureIntegrations: u.permissions.canConfigureIntegrations,
              canConfigureEmail: u.permissions.canConfigureEmail,
              canSeeDownloadOwner: u.permissions.canSeeDownloadOwner,
            }
          : null,
        hasPassword:
          u.accounts?.some((a) => a.providerId === "credential") ?? false,
        hasOIDC:
          u.accounts?.some((a) => a.providerId !== "credential") ?? false,
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
      canConfigureApp: false,
      canConfigureIntegrations: false,
      canConfigureEmail: false,
      canSeeDownloadOwner: false,
    };

    await db.insert(userPermissions).values({
      userId: userId,
      canDeleteDownloads: permissionsData.canDeleteDownloads,
      canConfigureNotifications: permissionsData.canConfigureNotifications,
      canManageRequests: permissionsData.canManageRequests,
      canConfigureApp: permissionsData.canConfigureApp,
      canConfigureIntegrations: permissionsData.canConfigureIntegrations,
      canConfigureEmail: permissionsData.canConfigureEmail,
      canSeeDownloadOwner: permissionsData.canSeeDownloadOwner,
    });

    // Fetch the created user with permissions and accounts
    const createdUser = await db.query.user.findFirst({
      where: eq(user.id, userId),
      with: {
        permissions: true,
        accounts: true,
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
              canConfigureApp: createdUser.permissions.canConfigureApp,
              canConfigureIntegrations:
                createdUser.permissions.canConfigureIntegrations,
              canConfigureEmail: createdUser.permissions.canConfigureEmail,
              canSeeDownloadOwner: createdUser.permissions.canSeeDownloadOwner,
            }
          : null,
        hasPassword:
          createdUser.accounts?.some((a) => a.providerId === "credential") ??
          false,
        hasOIDC:
          createdUser.accounts?.some((a) => a.providerId !== "credential") ??
          false,
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
      if (body.permissions.canConfigureApp !== undefined)
        permissionsUpdate.canConfigureApp = body.permissions.canConfigureApp;
      if (body.permissions.canConfigureIntegrations !== undefined)
        permissionsUpdate.canConfigureIntegrations =
          body.permissions.canConfigureIntegrations;
      if (body.permissions.canConfigureEmail !== undefined)
        permissionsUpdate.canConfigureEmail =
          body.permissions.canConfigureEmail;
      if (body.permissions.canSeeDownloadOwner !== undefined)
        permissionsUpdate.canSeeDownloadOwner =
          body.permissions.canSeeDownloadOwner;

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
          canConfigureApp: permissionsUpdate.canConfigureApp || false,
          canConfigureIntegrations:
            permissionsUpdate.canConfigureIntegrations || false,
          canConfigureEmail: permissionsUpdate.canConfigureEmail || false,
          canSeeDownloadOwner: permissionsUpdate.canSeeDownloadOwner || false,
        });
      }
    }

    // Fetch updated user with accounts
    const updatedUser = await db.query.user.findFirst({
      where: eq(user.id, id),
      with: {
        permissions: true,
        accounts: true,
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
              canConfigureApp: updatedUser.permissions.canConfigureApp,
              canConfigureIntegrations:
                updatedUser.permissions.canConfigureIntegrations,
              canConfigureEmail: updatedUser.permissions.canConfigureEmail,
              canSeeDownloadOwner: updatedUser.permissions.canSeeDownloadOwner,
            }
          : null,
        hasPassword:
          updatedUser.accounts?.some((a) => a.providerId === "credential") ??
          false,
        hasOIDC:
          updatedUser.accounts?.some((a) => a.providerId !== "credential") ??
          false,
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

// ============================================
// Current User Endpoints (authenticated users)
// ============================================

// GET /users/me - Get current user info
const getCurrentUserRoute = createRoute({
  method: "get",
  path: "/me",
  summary: "Get current user",
  description: "Get current user's profile including auth method availability",
  responses: {
    200: {
      description: "Current user info",
      content: {
        "application/json": {
          schema: CurrentUserSchema,
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

app.openapi(getCurrentUserRoute, async (c) => {
  try {
    const currentUser = c.get("user") as User;

    if (!currentUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Fetch user with accounts to check auth methods
    const userWithAccounts = await db.query.user.findFirst({
      where: eq(user.id, currentUser.id),
      with: {
        accounts: true,
      },
    });

    if (!userWithAccounts) {
      return c.json({ error: "User not found" }, 401);
    }

    return c.json(
      {
        id: userWithAccounts.id,
        name: userWithAccounts.name,
        email: userWithAccounts.email,
        role: userWithAccounts.role,
        hasPassword:
          userWithAccounts.accounts?.some(
            (a) => a.providerId === "credential",
          ) ?? false,
        hasOIDC:
          userWithAccounts.accounts?.some(
            (a) => a.providerId !== "credential",
          ) ?? false,
      },
      200,
    );
  } catch (error) {
    console.error("[Users] Error fetching current user:", error);
    return c.json({ error: "Failed to fetch user info" }, 500);
  }
});

// PATCH /users/me - Update current user profile
const updateCurrentUserRoute = createRoute({
  method: "patch",
  path: "/me",
  summary: "Update current user profile",
  description: "Update own email and name",
  request: {
    body: {
      content: {
        "application/json": {
          schema: UpdateProfileSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Profile updated",
      content: {
        "application/json": {
          schema: CurrentUserSchema,
        },
      },
    },
    400: {
      description: "Bad request (e.g., email already in use)",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
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

app.openapi(updateCurrentUserRoute, async (c) => {
  try {
    const currentUser = c.get("user") as User;
    const body = c.req.valid("json");

    if (!currentUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Fetch user with accounts to check auth methods
    const userWithAccounts = await db.query.user.findFirst({
      where: eq(user.id, currentUser.id),
      with: {
        accounts: true,
      },
    });

    if (!userWithAccounts) {
      return c.json({ error: "User not found" }, 404);
    }

    const hasPassword = userWithAccounts.accounts?.some(
      (a) => a.providerId === "credential",
    );
    const hasOIDC = userWithAccounts.accounts?.some(
      (a) => a.providerId !== "credential",
    );

    // Prevent OIDC-only users from changing their email (would break account linking)
    if (body.email && body.email !== currentUser.email) {
      if (hasOIDC && !hasPassword) {
        return c.json(
          { error: "Email cannot be changed for SSO-only accounts" },
          400,
        );
      }

      // Check if email is already in use
      const existingUser = await db.query.user.findFirst({
        where: eq(user.email, body.email),
      });
      if (existingUser) {
        return c.json({ error: "Email already in use" }, 400);
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) updateData.name = body.name;
    if (body.email) updateData.email = body.email;

    // Update user
    await db.update(user).set(updateData).where(eq(user.id, currentUser.id));

    // If email changed, also update the credential account email
    if (body.email && body.email !== currentUser.email) {
      await db
        .update(account)
        .set({ accountId: body.email })
        .where(eq(account.userId, currentUser.id));
    }

    // Fetch updated user with accounts
    const updatedUser = await db.query.user.findFirst({
      where: eq(user.id, currentUser.id),
      with: {
        accounts: true,
      },
    });

    if (!updatedUser) {
      return c.json({ error: "User not found after update" }, 500);
    }

    return c.json(
      {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        hasPassword:
          updatedUser.accounts?.some((a) => a.providerId === "credential") ??
          false,
        hasOIDC:
          updatedUser.accounts?.some((a) => a.providerId !== "credential") ??
          false,
      },
      200,
    );
  } catch (error) {
    console.error("[Users] Error updating current user:", error);
    return c.json({ error: String(error) }, 500);
  }
});

// ============================================
// Admin Password Reset Endpoint
// ============================================

// POST /users/:id/password - Admin set user password
const setUserPasswordRoute = createRoute({
  method: "post",
  path: "/{id}/password",
  summary: "Set user password",
  description:
    "Admin-only: Set a user's password (no current password required)",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: SetPasswordSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Password updated successfully",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    400: {
      description: "Bad request (e.g., user has no credential account)",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
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

app.openapi(setUserPasswordRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { newPassword } = c.req.valid("json");

  try {
    // Check if user exists with accounts
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, id),
      with: {
        accounts: true,
      },
    });

    if (!existingUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if user has a credential account
    const hasPassword = existingUser.accounts?.some(
      (a) => a.providerId === "credential",
    );

    if (!hasPassword) {
      return c.json(
        {
          error:
            "This user authenticates via OIDC only. Password cannot be set.",
        },
        400,
      );
    }

    // Use Better Auth's admin API to set the password
    const result = await auth.api.setUserPassword({
      body: {
        userId: id,
        newPassword,
      },
    });

    if (!result) {
      throw new Error("Failed to set password");
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("[Users] Error setting user password:", error);
    return c.json({ error: String(error) }, 500);
  }
});

export default app;
