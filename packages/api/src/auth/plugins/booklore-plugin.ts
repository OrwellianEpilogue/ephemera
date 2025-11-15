import { credentials } from "better-auth-credentials-plugin";
import { z } from "zod";
import { login } from "../../services/booklore-auth.js";
import { db } from "../../db/index.js";
import { calibreConfig } from "../../db/schema.js";
import { eq } from "drizzle-orm";

// @ts-expect-error - Type instantiation is excessively deep, but this works at runtime
export const booklorePlugin = credentials({
  providerId: "booklore",
  path: "/sign-in/booklore", // Custom path to avoid conflicts
  autoSignUp: true,
  linkAccountIfExisting: true,
  inputSchema: z.object({
    email: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  }),

  async callback(_ctx: unknown, parsed: { email: string; password: string }) {
    const username = parsed.email; // Email field contains username
    const password = parsed.password;

    // Get Booklore base URL from calibreConfig
    const config = await db
      .select()
      .from(calibreConfig)
      .where(eq(calibreConfig.id, 1))
      .limit(1);

    const baseUrl = config[0]?.baseUrl;

    if (!baseUrl) {
      throw new Error(
        "Booklore is not configured. Please configure Booklore in settings first.",
      );
    }

    // Authenticate with Booklore
    const result = await login(baseUrl, username, password);

    if (!result.success || !result.tokens) {
      throw new Error(result.error || "Authentication failed");
    }

    // Create virtual email from username
    const email = `${username}@booklore.local`;

    return {
      email,
      name: username,
      onLinkAccount: () => ({
        accessToken: result.tokens!.accessToken,
        refreshToken: result.tokens!.refreshToken,
        accessTokenExpiresAt: new Date(result.tokens!.accessTokenExpiresAt),
        refreshTokenExpiresAt: new Date(result.tokens!.refreshTokenExpiresAt),
      }),
    };
  },
});
