/**
 * Setup Security Service
 *
 * Manages setup key protection for older installs upgrading to v2.0.
 * Prevents non-admin users from viewing sensitive env vars in the setup wizard.
 */
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { downloads, appConfig } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

interface SetupSecurityState {
  setupKey: string | null;
  requiresKey: boolean;
  validatedTokens: Set<string>;
}

const state: SetupSecurityState = {
  setupKey: null,
  requiresKey: false,
  validatedTokens: new Set(),
};

export const setupSecurityService = {
  /**
   * Initialize setup security on server startup.
   * Checks conditions and generates key if needed.
   */
  async initialize(): Promise<void> {
    // Only run if setup is not already complete
    try {
      const config = await db.query.appConfig.findFirst({
        where: eq(appConfig.id, 1),
      });

      if (config?.isSetupComplete) {
        state.requiresKey = false;
        return;
      }
    } catch {
      // Table might not exist yet on fresh install
      state.requiresKey = false;
      return;
    }

    // Check for older install conditions
    const hasLegacyEnvVars = Boolean(
      process.env.AA_API_KEY || process.env.AA_BASE_URL,
    );
    const hasExistingData = await this.checkExistingData();

    state.requiresKey = hasLegacyEnvVars || hasExistingData;

    if (state.requiresKey) {
      state.setupKey = this.generateKey();
      logger.warn(
        "═══════════════════════════════════════════════════════════════════",
      );
      logger.warn("SETUP KEY REQUIRED");
      logger.warn("An existing installation was detected.");
      logger.warn(`Your setup key is: ${state.setupKey}`);
      logger.warn("Enter this key in the setup wizard to proceed.");
      logger.warn(
        "═══════════════════════════════════════════════════════════════════",
      );
    }
  },

  /**
   * Check if existing downloads exist in database.
   */
  async checkExistingData(): Promise<boolean> {
    try {
      const result = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(downloads)
        .limit(1);
      return (result[0]?.count ?? 0) > 0;
    } catch {
      // Table might not exist yet
      return false;
    }
  },

  /**
   * Generate a random 24-character setup key.
   */
  generateKey(): string {
    return crypto.randomBytes(18).toString("base64url").slice(0, 24);
  },

  /**
   * Check if setup key protection is required.
   */
  requiresSetupKey(): boolean {
    return state.requiresKey;
  },

  /**
   * Validate the provided setup key.
   * Uses constant-time comparison to prevent timing attacks.
   */
  validateKey(providedKey: string): boolean {
    if (!state.requiresKey || !state.setupKey) {
      return true; // No key required
    }
    // Use constant-time comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedKey);
    const expectedBuffer = Buffer.from(state.setupKey);
    // Ensure buffers are same length before comparison
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  },

  /**
   * Generate a validation token after successful key entry.
   * Token auto-expires after 30 minutes.
   */
  generateValidationToken(): string {
    const token = crypto.randomBytes(32).toString("hex");
    state.validatedTokens.add(token);
    // Auto-expire after 30 minutes
    setTimeout(
      () => {
        state.validatedTokens.delete(token);
      },
      30 * 60 * 1000,
    );
    return token;
  },

  /**
   * Check if a validation token is valid.
   */
  isTokenValid(token: string | undefined): boolean {
    if (!state.requiresKey) return true;
    if (!token) return false;
    return state.validatedTokens.has(token);
  },
};
