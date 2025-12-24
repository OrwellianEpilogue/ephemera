import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  emailSettings,
  emailRecipients,
  type EmailSettings,
  type EmailRecipient,
} from "../db/schema.js";
import { logger } from "../utils/logger.js";

/**
 * Email Settings Service
 * Manages SMTP email configuration and recipient list
 */
class EmailSettingsService {
  private settingsCache: EmailSettings | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get current email settings
   * Results are cached for 1 minute
   */
  async getSettings(): Promise<EmailSettings | null> {
    // Check cache first
    if (this.settingsCache && Date.now() < this.cacheExpiry) {
      return this.settingsCache;
    }

    try {
      const result = await db
        .select()
        .from(emailSettings)
        .where(eq(emailSettings.id, 1))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      this.settingsCache = result[0];
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return this.settingsCache;
    } catch (error) {
      logger.error("[Email Settings] Error fetching settings:", error);
      return null;
    }
  }

  /**
   * Update email settings
   */
  async updateSettings(
    updates: Partial<Omit<EmailSettings, "id" | "updatedAt">>,
  ): Promise<EmailSettings> {
    const existing = await this.getSettings();

    const settingsData = {
      id: 1,
      enabled: updates.enabled ?? existing?.enabled ?? false,
      smtpHost: updates.smtpHost ?? existing?.smtpHost ?? null,
      smtpPort: updates.smtpPort ?? existing?.smtpPort ?? 587,
      smtpUser: updates.smtpUser ?? existing?.smtpUser ?? null,
      smtpPassword: updates.smtpPassword ?? existing?.smtpPassword ?? null,
      senderEmail: updates.senderEmail ?? existing?.senderEmail ?? null,
      senderName: updates.senderName ?? existing?.senderName ?? null,
      useTls: updates.useTls ?? existing?.useTls ?? true,
      updatedAt: Date.now(),
    };

    if (existing) {
      await db
        .update(emailSettings)
        .set(settingsData)
        .where(eq(emailSettings.id, 1));
    } else {
      await db.insert(emailSettings).values(settingsData);
    }

    this.clearCache();

    const updated = await this.getSettings();
    if (!updated) {
      throw new Error("Failed to fetch updated settings");
    }

    return updated;
  }

  /**
   * Initialize default settings if none exist
   */
  async initializeDefaults(): Promise<void> {
    try {
      const existing = await this.getSettings();
      if (!existing) {
        logger.info("[Email Settings] Initializing default settings");
        await db.insert(emailSettings).values({
          id: 1,
          enabled: false,
          smtpPort: 587,
          useTls: true,
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      logger.error("[Email Settings] Error initializing defaults:", error);
    }
  }

  /**
   * Check if email is enabled and properly configured
   */
  async isEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return (
      settings?.enabled === true &&
      !!settings.smtpHost &&
      !!settings.senderEmail
    );
  }

  /**
   * Clear settings cache
   */
  clearCache(): void {
    this.settingsCache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get settings for API response (convert timestamp to ISO string)
   */
  async getSettingsForResponse(): Promise<{
    id: number;
    enabled: boolean;
    smtpHost: string | null;
    smtpPort: number;
    smtpUser: string | null;
    smtpPassword: string | null;
    senderEmail: string | null;
    senderName: string | null;
    useTls: boolean;
    updatedAt: string;
  } | null> {
    const settings = await this.getSettings();
    if (!settings) {
      return null;
    }

    return {
      id: settings.id,
      enabled: settings.enabled,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser,
      smtpPassword: settings.smtpPassword,
      senderEmail: settings.senderEmail,
      senderName: settings.senderName,
      useTls: settings.useTls,
      updatedAt: new Date(settings.updatedAt).toISOString(),
    };
  }

  // ============== Recipients Management ==============

  /**
   * Get all email recipients
   */
  async getRecipients(): Promise<EmailRecipient[]> {
    try {
      return await db.select().from(emailRecipients).all();
    } catch (error) {
      logger.error("[Email Settings] Error fetching recipients:", error);
      return [];
    }
  }

  /**
   * Get a single recipient by ID
   */
  async getRecipient(id: number): Promise<EmailRecipient | null> {
    try {
      const result = await db
        .select()
        .from(emailRecipients)
        .where(eq(emailRecipients.id, id))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error("[Email Settings] Error fetching recipient:", error);
      return null;
    }
  }

  /**
   * Add a new email recipient
   */
  async addRecipient(
    email: string,
    name?: string | null,
  ): Promise<EmailRecipient> {
    const result = await db
      .insert(emailRecipients)
      .values({
        email,
        name: name ?? null,
        createdAt: Date.now(),
      })
      .returning();

    logger.info(`[Email Settings] Added recipient: ${email}`);
    return result[0];
  }

  /**
   * Delete an email recipient
   */
  async deleteRecipient(id: number): Promise<boolean> {
    const result = await db
      .delete(emailRecipients)
      .where(eq(emailRecipients.id, id));

    const deleted = result.changes > 0;
    if (deleted) {
      logger.info(`[Email Settings] Deleted recipient with id: ${id}`);
    }
    return deleted;
  }
}

// Export singleton instance
export const emailSettingsService = new EmailSettingsService();
