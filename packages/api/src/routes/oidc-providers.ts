import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { ssoProvider } from "../db/schema.js";
import { eq } from "drizzle-orm";

const app = new OpenAPIHono();

// Normalize issuer URL by removing trailing slash
// Fixes compatibility with Authentik and other IdPs that return issuer with trailing slash
function normalizeIssuerUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// Schemas
const OIDCConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()).default(["openid", "email", "profile"]),
  discoveryEndpoint: z.string().url().optional(),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  userInfoEndpoint: z.string().url().optional(),
  jwksEndpoint: z.string().url().optional(),
  pkce: z.boolean().default(true),
  mapping: z
    .object({
      id: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
      emailVerified: z.string().optional(),
    })
    .optional(),
});

// Schema for default permissions (JSON stored in DB)
const DefaultPermissionsSchema = z
  .object({
    canDeleteDownloads: z.boolean().optional(),
    canConfigureNotifications: z.boolean().optional(),
    canManageRequests: z.boolean().optional(),
    canStartDownloads: z.boolean().optional(),
    canConfigureApp: z.boolean().optional(),
    canConfigureIntegrations: z.boolean().optional(),
    canConfigureEmail: z.boolean().optional(),
    canSeeDownloadOwner: z.boolean().optional(),
    canManageApiKeys: z.boolean().optional(),
    canConfigureTolino: z.boolean().optional(),
    canManageLists: z.boolean().optional(),
  })
  .optional();

const OIDCProviderSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string().optional(),
  issuer: z.string(),
  domain: z.string().nullable(),
  allowAutoProvision: z.boolean(),
  enabled: z.boolean(),
  // Group claims for auto-admin
  groupClaimName: z.string().nullable(),
  adminGroupValue: z.string().nullable(),
  // Default permissions for new users
  defaultPermissions: DefaultPermissionsSchema.nullable(),
  oidcConfig: OIDCConfigSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateOIDCProviderSchema = z.object({
  providerId: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-]+$/,
      "Provider ID must contain only lowercase letters, numbers, and hyphens",
    ),
  name: z.string().min(1).optional(),
  issuer: z.string().url(),
  discoveryUrl: z.string().url(),
  domain: z.string().optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()).default(["openid", "email", "profile"]),
  allowAutoProvision: z.boolean().default(false),
  enabled: z.boolean().default(true),
  // Group claims for auto-admin
  groupClaimName: z.string().optional(),
  adminGroupValue: z.string().optional(),
  // Default permissions for new users
  defaultPermissions: DefaultPermissionsSchema,
});

const UpdateOIDCProviderSchema = z.object({
  name: z.string().min(1).optional(),
  issuer: z.string().url().optional(),
  discoveryUrl: z.string().url().optional(),
  domain: z.string().nullable().optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
  allowAutoProvision: z.boolean().optional(),
  enabled: z.boolean().optional(),
  // Group claims for auto-admin
  groupClaimName: z.string().nullable().optional(),
  adminGroupValue: z.string().nullable().optional(),
  // Default permissions for new users
  defaultPermissions: DefaultPermissionsSchema.nullable(),
});

// GET /oidc-providers - List all providers
const getProvidersRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List OIDC providers",
  description: "Get all configured OIDC providers (admin only)",
  responses: {
    200: {
      description: "List of OIDC providers",
      content: {
        "application/json": {
          schema: z.array(OIDCProviderSchema),
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

app.openapi(getProvidersRoute, async (c) => {
  try {
    const providers = await db.select().from(ssoProvider);

    return c.json(
      providers.map((p) => ({
        id: p.id,
        providerId: p.providerId,
        name: p.name || p.providerId,
        issuer: p.issuer,
        domain: p.domain,
        allowAutoProvision: p.allowAutoProvision,
        enabled: p.enabled,
        groupClaimName: p.groupClaimName,
        adminGroupValue: p.adminGroupValue,
        defaultPermissions: p.defaultPermissions
          ? JSON.parse(p.defaultPermissions)
          : null,
        oidcConfig: p.oidcConfig ? JSON.parse(p.oidcConfig) : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      200,
    );
  } catch (error) {
    console.error("[OIDC Providers] Error fetching providers:", error);
    return c.json({ error: "Failed to fetch providers" }, 500);
  }
});

// POST /oidc-providers - Create provider
const createProviderRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create OIDC provider",
  description: "Create a new OIDC provider configuration (admin only)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateOIDCProviderSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Provider created",
      content: {
        "application/json": {
          schema: OIDCProviderSchema,
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

app.openapi(createProviderRoute, async (c) => {
  const body = c.req.valid("json");

  try {
    // Check if provider ID already exists
    const existing = await db
      .select()
      .from(ssoProvider)
      .where(eq(ssoProvider.providerId, body.providerId))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: "Provider ID already exists" }, 400);
    }

    // Fetch discovery document to get required endpoints
    let discoveryDoc;
    try {
      const discoveryResponse = await fetch(body.discoveryUrl);
      if (!discoveryResponse.ok) {
        return c.json(
          {
            error: `Failed to fetch discovery document: ${discoveryResponse.status}`,
          },
          400,
        );
      }
      discoveryDoc = await discoveryResponse.json();
    } catch (error) {
      return c.json(
        {
          error: `Failed to fetch discovery document: ${error instanceof Error ? error.message : String(error)}`,
        },
        400,
      );
    }

    // Validate required endpoints exist
    if (!discoveryDoc.authorization_endpoint || !discoveryDoc.token_endpoint) {
      return c.json(
        {
          error:
            "Discovery document missing required endpoints (authorization_endpoint, token_endpoint)",
        },
        400,
      );
    }

    // Build OIDC config with all required endpoints
    const oidcConfig = {
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      scopes: body.scopes,
      discoveryEndpoint: body.discoveryUrl,
      authorizationEndpoint: discoveryDoc.authorization_endpoint,
      tokenEndpoint: discoveryDoc.token_endpoint,
      userInfoEndpoint: discoveryDoc.userinfo_endpoint,
      jwksEndpoint: discoveryDoc.jwks_uri,
      pkce: true,
      mapping: {
        id: "sub",
        email: "email",
        name: "name",
        emailVerified: "email_verified",
      },
    };

    // Store in our database (Better Auth SSO plugin reads from here)
    const id = crypto.randomUUID();
    await db.insert(ssoProvider).values({
      id,
      providerId: body.providerId,
      name: body.name || null,
      issuer: normalizeIssuerUrl(body.issuer),
      domain: body.domain || "",
      allowAutoProvision: body.allowAutoProvision ?? false,
      groupClaimName: body.groupClaimName || null,
      adminGroupValue: body.adminGroupValue || null,
      defaultPermissions: body.defaultPermissions
        ? JSON.stringify(body.defaultPermissions)
        : null,
      oidcConfig: JSON.stringify(oidcConfig),
      enabled: body.enabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Fetch created provider
    const created = await db
      .select()
      .from(ssoProvider)
      .where(eq(ssoProvider.id, id))
      .limit(1);

    const provider = created[0];

    return c.json(
      {
        id: provider.id,
        providerId: provider.providerId,
        name: provider.name || provider.providerId,
        issuer: provider.issuer,
        domain: provider.domain,
        allowAutoProvision: provider.allowAutoProvision,
        enabled: provider.enabled,
        groupClaimName: provider.groupClaimName,
        adminGroupValue: provider.adminGroupValue,
        defaultPermissions: provider.defaultPermissions
          ? JSON.parse(provider.defaultPermissions)
          : null,
        oidcConfig: provider.oidcConfig
          ? JSON.parse(provider.oidcConfig)
          : null,
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    console.error("[OIDC Providers] Error creating provider:", error);
    return c.json({ error: String(error) }, 500);
  }
});

// PATCH /oidc-providers/:id - Update provider
const updateProviderRoute = createRoute({
  method: "patch",
  path: "/{id}",
  summary: "Update OIDC provider",
  description: "Update an existing OIDC provider configuration (admin only)",
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateOIDCProviderSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Provider updated",
      content: {
        "application/json": {
          schema: OIDCProviderSchema,
        },
      },
    },
    404: {
      description: "Provider not found",
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

app.openapi(updateProviderRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  try {
    // Check if provider exists
    const existing = await db
      .select()
      .from(ssoProvider)
      .where(eq(ssoProvider.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Provider not found" }, 404);
    }

    const provider = existing[0];
    const currentConfig = provider.oidcConfig
      ? JSON.parse(provider.oidcConfig)
      : {};

    // Build updated config
    const updatedConfig = {
      ...currentConfig,
      ...(body.clientId && { clientId: body.clientId }),
      ...(body.clientSecret && { clientSecret: body.clientSecret }),
      ...(body.scopes && { scopes: body.scopes }),
      ...(body.discoveryUrl && { discoveryUrl: body.discoveryUrl }),
    };

    // Update in database
    await db
      .update(ssoProvider)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.issuer && { issuer: normalizeIssuerUrl(body.issuer) }),
        ...(body.domain !== undefined && { domain: body.domain || "" }),
        ...(body.allowAutoProvision !== undefined && {
          allowAutoProvision: body.allowAutoProvision,
        }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.groupClaimName !== undefined && {
          groupClaimName: body.groupClaimName,
        }),
        ...(body.adminGroupValue !== undefined && {
          adminGroupValue: body.adminGroupValue,
        }),
        ...(body.defaultPermissions !== undefined && {
          defaultPermissions: body.defaultPermissions
            ? JSON.stringify(body.defaultPermissions)
            : null,
        }),
        oidcConfig: JSON.stringify(updatedConfig),
        updatedAt: new Date(),
      })
      .where(eq(ssoProvider.id, id));

    // Fetch updated provider
    const updated = await db
      .select()
      .from(ssoProvider)
      .where(eq(ssoProvider.id, id))
      .limit(1);

    const updatedProvider = updated[0];

    return c.json(
      {
        id: updatedProvider.id,
        providerId: updatedProvider.providerId,
        name: updatedProvider.name || updatedProvider.providerId,
        issuer: updatedProvider.issuer,
        domain: updatedProvider.domain,
        allowAutoProvision: updatedProvider.allowAutoProvision,
        enabled: updatedProvider.enabled,
        groupClaimName: updatedProvider.groupClaimName,
        adminGroupValue: updatedProvider.adminGroupValue,
        defaultPermissions: updatedProvider.defaultPermissions
          ? JSON.parse(updatedProvider.defaultPermissions)
          : null,
        oidcConfig: updatedProvider.oidcConfig
          ? JSON.parse(updatedProvider.oidcConfig)
          : null,
        createdAt: updatedProvider.createdAt.toISOString(),
        updatedAt: updatedProvider.updatedAt.toISOString(),
      },
      200,
    );
  } catch (error) {
    console.error("[OIDC Providers] Error updating provider:", error);
    return c.json({ error: String(error) }, 500);
  }
});

// DELETE /oidc-providers/:id - Delete provider
const deleteProviderRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete OIDC provider",
  description: "Delete an OIDC provider configuration (admin only)",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Provider deleted",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    404: {
      description: "Provider not found",
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

app.openapi(deleteProviderRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    // Check if provider exists
    const existing = await db
      .select()
      .from(ssoProvider)
      .where(eq(ssoProvider.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Provider not found" }, 404);
    }

    // Delete from database
    await db.delete(ssoProvider).where(eq(ssoProvider.id, id));

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("[OIDC Providers] Error deleting provider:", error);
    return c.json({ error: String(error) }, 500);
  }
});

// POST /oidc-providers/:id/test - Test provider connection
const testProviderRoute = createRoute({
  method: "post",
  path: "/{id}/test",
  summary: "Test OIDC provider",
  description: "Test connection to an OIDC provider (admin only)",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Provider connection test result",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    404: {
      description: "Provider not found",
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

app.openapi(testProviderRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    // Check if provider exists
    const existing = await db
      .select()
      .from(ssoProvider)
      .where(eq(ssoProvider.id, id))
      .limit(1);

    if (existing.length === 0) {
      return c.json({ error: "Provider not found" }, 404);
    }

    const provider = existing[0];
    const config = provider.oidcConfig ? JSON.parse(provider.oidcConfig) : {};

    // Test discovery endpoint if available
    if (config.discoveryUrl) {
      try {
        const response = await fetch(config.discoveryUrl);
        if (!response.ok) {
          return c.json(
            {
              success: false,
              message: `Discovery endpoint returned ${response.status}`,
            },
            200,
          );
        }

        const discovery = await response.json();
        if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
          return c.json(
            {
              success: false,
              message: "Invalid discovery response: missing required endpoints",
            },
            200,
          );
        }

        return c.json(
          {
            success: true,
            message: "Provider configuration is valid",
          },
          200,
        );
      } catch (error) {
        return c.json(
          {
            success: false,
            message: `Failed to fetch discovery document: ${error}`,
          },
          200,
        );
      }
    }

    return c.json(
      {
        success: true,
        message: "Provider configuration saved (discovery test skipped)",
      },
      200,
    );
  } catch (error) {
    console.error("[OIDC Providers] Error testing provider:", error);
    return c.json({ error: String(error) }, 500);
  }
});

export default app;
