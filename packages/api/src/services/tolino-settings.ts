import { eq } from "drizzle-orm";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import { db } from "../db/index.js";
import { tolinoSettings, user, type TolinoSettings } from "../db/schema.js";
import { tolinoAuthService, type TolinoTokens } from "./tolino/auth.js";
import { getAllResellers, type ResellerId } from "./tolino/resellers.js";
import { logger } from "../utils/logger.js";
import { appriseService } from "./apprise.js";

// Encryption algorithm
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Get encryption key from AUTH_SECRET
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET || "default-secret-change-me";
  return scryptSync(secret, "tolino-salt", 32);
}

/**
 * Encrypt a string
 */
function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Format: iv:tag:encrypted
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a string
 */
function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const [ivHex, tagHex, data] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export interface TolinoSettingsInput {
  resellerId: ResellerId;
  email: string;
  password: string;
  autoUpload: boolean;
  askCollectionOnUpload?: boolean;
  autoUploadCollection?: string | null;
  useSeriesAsCollection?: boolean;
}

export interface TolinoSettingsResponse {
  resellerId: ResellerId;
  email: string;
  autoUpload: boolean;
  askCollectionOnUpload: boolean;
  autoUploadCollection: string | null;
  useSeriesAsCollection: boolean;
  isConnected: boolean;
  tokenExpiresAt: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tolino Settings Service
 * Manages per-user Tolino configuration
 */
class TolinoSettingsService {
  /**
   * Get settings for a user (for API response - no password)
   */
  async getSettings(userId: string): Promise<TolinoSettingsResponse | null> {
    const result = await db
      .select()
      .from(tolinoSettings)
      .where(eq(tolinoSettings.userId, userId))
      .limit(1);

    if (!result.length) {
      return null;
    }

    const settings = result[0];

    return {
      resellerId: settings.resellerId as ResellerId,
      email: settings.email,
      autoUpload: settings.autoUpload,
      askCollectionOnUpload: settings.askCollectionOnUpload,
      autoUploadCollection: settings.autoUploadCollection,
      useSeriesAsCollection: settings.useSeriesAsCollection,
      isConnected: this.isConnected(settings),
      tokenExpiresAt: settings.tokenExpiresAt,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  /**
   * Get raw settings (internal use - includes tokens)
   */
  async getRawSettings(userId: string): Promise<TolinoSettings | null> {
    const result = await db
      .select()
      .from(tolinoSettings)
      .where(eq(tolinoSettings.userId, userId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Check if user has configured Tolino
   */
  async hasSettings(userId: string): Promise<boolean> {
    const result = await db
      .select({ id: tolinoSettings.id })
      .from(tolinoSettings)
      .where(eq(tolinoSettings.userId, userId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Check if settings have valid connection
   */
  private isConnected(settings: TolinoSettings): boolean {
    if (!settings.accessToken || !settings.tokenExpiresAt) {
      return false;
    }
    return !tolinoAuthService.isTokenExpired(settings.tokenExpiresAt);
  }

  /**
   * Save or update settings (performs login to get tokens)
   */
  async saveSettings(
    userId: string,
    input: TolinoSettingsInput,
  ): Promise<TolinoSettingsResponse> {
    logger.info(`[Tolino Settings] Saving settings for user ${userId}`);

    // Encrypt the password
    const encryptedPassword = encrypt(input.password);

    // Perform login to get tokens
    const tokens = await tolinoAuthService.login(
      input.email,
      input.password,
      input.resellerId,
    );

    // Generate hardware ID if this is a new setup
    const existingSettings = await this.getRawSettings(userId);
    const hardwareId =
      existingSettings?.hardwareId || tolinoAuthService.generateHardwareId();

    // Register device
    await tolinoAuthService.registerDevice(
      tokens.accessToken,
      hardwareId,
      input.resellerId,
    );

    const now = new Date();

    if (existingSettings) {
      // Update existing
      await db
        .update(tolinoSettings)
        .set({
          resellerId: input.resellerId,
          email: input.email,
          encryptedPassword,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
          hardwareId,
          autoUpload: input.autoUpload,
          askCollectionOnUpload: input.askCollectionOnUpload ?? false,
          autoUploadCollection: input.autoUploadCollection ?? null,
          useSeriesAsCollection: input.useSeriesAsCollection ?? false,
          updatedAt: now,
        })
        .where(eq(tolinoSettings.userId, userId));
    } else {
      // Create new
      await db.insert(tolinoSettings).values({
        userId,
        resellerId: input.resellerId,
        email: input.email,
        encryptedPassword,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        hardwareId,
        autoUpload: input.autoUpload,
        askCollectionOnUpload: input.askCollectionOnUpload ?? false,
        autoUploadCollection: input.autoUploadCollection ?? null,
        useSeriesAsCollection: input.useSeriesAsCollection ?? false,
        createdAt: now,
        updatedAt: now,
      });
    }

    logger.info(`[Tolino Settings] Settings saved for user ${userId}`);

    // Send notification for new Tolino configuration
    const userResult = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const tolinoUser = userResult[0];
    const reseller = getAllResellers().find((r) => r.id === input.resellerId);

    await appriseService.send("tolino_configured", {
      userName: tolinoUser?.name || tolinoUser?.email || "Unknown user",
      reseller: reseller?.name || input.resellerId,
    });

    return {
      resellerId: input.resellerId,
      email: input.email,
      autoUpload: input.autoUpload,
      askCollectionOnUpload: input.askCollectionOnUpload ?? false,
      autoUploadCollection: input.autoUploadCollection ?? null,
      useSeriesAsCollection: input.useSeriesAsCollection ?? false,
      isConnected: true,
      tokenExpiresAt: tokens.expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Update only autoUpload setting
   */
  async updateAutoUpload(userId: string, autoUpload: boolean): Promise<void> {
    await db
      .update(tolinoSettings)
      .set({
        autoUpload,
        updatedAt: new Date(),
      })
      .where(eq(tolinoSettings.userId, userId));
  }

  /**
   * Update collection settings
   */
  async updateCollectionSettings(
    userId: string,
    askCollectionOnUpload: boolean,
    autoUploadCollection: string | null,
    useSeriesAsCollection?: boolean,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      askCollectionOnUpload,
      autoUploadCollection,
      updatedAt: new Date(),
    };
    if (useSeriesAsCollection !== undefined) {
      updateData.useSeriesAsCollection = useSeriesAsCollection;
    }
    await db
      .update(tolinoSettings)
      .set(updateData)
      .where(eq(tolinoSettings.userId, userId));
  }

  /**
   * Delete settings for a user
   */
  async deleteSettings(userId: string): Promise<boolean> {
    const result = await db
      .delete(tolinoSettings)
      .where(eq(tolinoSettings.userId, userId))
      .returning();

    if (result.length > 0) {
      logger.info(`[Tolino Settings] Deleted settings for user ${userId}`);
      return true;
    }
    return false;
  }

  /**
   * Update stored tokens after refresh
   */
  async updateTokens(userId: string, tokens: TolinoTokens): Promise<void> {
    await db
      .update(tolinoSettings)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(tolinoSettings.userId, userId));
  }

  /**
   * Get all users with auto-upload enabled
   */
  async getUsersWithAutoUpload(): Promise<string[]> {
    const result = await db
      .select({ userId: tolinoSettings.userId })
      .from(tolinoSettings)
      .where(eq(tolinoSettings.autoUpload, true));

    return result.map((r) => r.userId);
  }

  /**
   * Get available resellers
   */
  getResellers() {
    return getAllResellers();
  }

  /**
   * Decrypt password for re-login (internal use only)
   */
  async getDecryptedPassword(userId: string): Promise<string | null> {
    const settings = await this.getRawSettings(userId);
    if (!settings) {
      return null;
    }

    try {
      return decrypt(settings.encryptedPassword);
    } catch (error) {
      logger.error(`[Tolino Settings] Failed to decrypt password:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const tolinoSettingsService = new TolinoSettingsService();
