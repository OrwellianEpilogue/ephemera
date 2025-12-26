import { credentials } from "better-auth-credentials-plugin";
import { z } from "zod";
import { compareSync } from "@node-rs/bcrypt";
import Database from "better-sqlite3";
import { db } from "../../db/index.js";
import { calibreConfig } from "../../db/schema.js";
import { eq } from "drizzle-orm";

interface CalibreUser {
  id: number;
  name: string;
  email: string;
  password: string;
  role: number;
}

// @ts-expect-error - Type instantiation is excessively deep, but this works at runtime
export const calibrePlugin = credentials({
  providerId: "calibre",
  path: "/sign-in/calibre", // Custom path to avoid conflicts
  autoSignUp: true,
  linkAccountIfExisting: true,
  inputSchema: z.object({
    email: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  }),

  async callback(_ctx: unknown, parsed: { email: string; password: string }) {
    const username = parsed.email; // Email field contains username
    const password = parsed.password;

    // Get Calibre database path from calibreConfig
    const config = await db
      .select()
      .from(calibreConfig)
      .where(eq(calibreConfig.id, 1))
      .limit(1);

    const dbPath = config[0]?.dbPath;

    if (!dbPath) {
      throw new Error(
        "Calibre-Web-Automated is not configured. Please configure the database path in settings first.",
      );
    }

    // Open CWA SQLite database
    let cwaDb: Database.Database;
    try {
      cwaDb = new Database(dbPath, { readonly: true });
    } catch (error) {
      throw new Error(
        `Failed to open Calibre database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Query user from CWA database
      const user = cwaDb
        .prepare(
          "SELECT id, name, email, password, role FROM user WHERE name = ?",
        )
        .get(username) as CalibreUser | undefined;

      if (!user) {
        throw new Error("Invalid username or password");
      }

      // Verify password against bcrypt hash
      const isValidPassword = compareSync(password, user.password);

      if (!isValidPassword) {
        throw new Error("Invalid username or password");
      }

      // Use CWA email or create virtual email
      const email = user.email || `${username}@calibre.local`;

      return {
        email,
        name: user.name,
        // Note: Better Auth doesn't support role in the callback return
        // We'll need to set this separately in an onSignIn/onSignUp callback
        onLinkAccount: () => ({
          accountId: user.id.toString(),
        }),
      };
    } finally {
      cwaDb.close();
    }
  },
});
