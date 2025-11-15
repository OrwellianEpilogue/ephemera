import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { db } from "../db/index.js";
import { bookloreSettings, calibreConfig, ssoProvider } from "../db/schema.js";
import { eq } from "drizzle-orm";

const app = new OpenAPIHono();

// Schema for available auth methods response
const AuthMethodsResponseSchema = z.object({
  password: z
    .boolean()
    .describe("Email/Password authentication (always available)"),
  booklore: z.boolean().describe("Booklore authentication availability"),
  calibre: z.boolean().describe("Calibre-Web authentication availability"),
  oauth2: z.boolean().describe("OAuth2/OIDC authentication availability"),
});

// GET /auth/methods - Get available authentication methods
const getAuthMethodsRoute = createRoute({
  method: "get",
  path: "/methods",
  summary: "Get available authentication methods",
  description:
    "Returns which authentication methods are configured and available for login",
  responses: {
    200: {
      description: "Available authentication methods",
      content: {
        "application/json": {
          schema: AuthMethodsResponseSchema,
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

app.openapi(getAuthMethodsRoute, async (c) => {
  try {
    // Check Booklore configuration
    const bookloreConfig = await db
      .select()
      .from(bookloreSettings)
      .where(eq(bookloreSettings.id, 1))
      .limit(1);

    const bookloreEnabled =
      bookloreConfig[0]?.enabled && bookloreConfig[0]?.baseUrl;

    // Check Calibre configuration
    const calibreConfiguration = await db
      .select()
      .from(calibreConfig)
      .where(eq(calibreConfig.id, 1))
      .limit(1);

    const calibreEnabled =
      calibreConfiguration[0]?.enabled && calibreConfiguration[0]?.dbPath;

    // Check OAuth2/OIDC providers
    const oidcProviders = await db
      .select()
      .from(ssoProvider)
      .where(eq(ssoProvider.enabled, true));

    const oauth2Enabled = oidcProviders.length > 0;

    return c.json(
      {
        password: true, // Always available
        booklore: !!bookloreEnabled,
        calibre: !!calibreEnabled,
        oauth2: oauth2Enabled,
      },
      200,
    );
  } catch (error) {
    console.error("[Auth Methods] Error fetching auth methods:", error);
    return c.json({ error: "Failed to fetch authentication methods" }, 500);
  }
});

export default app;
