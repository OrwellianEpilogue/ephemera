import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  emailSettings,
  emailRecipients,
  user,
  type EmailSettings,
  type EmailRecipient,
} from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { appriseService } from "./apprise.js";

// Extended type to include user info for admin views
export type EmailRecipientWithUser = EmailRecipient & {
  userName?: string | null;
  userEmail?: string | null;
};

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
   * Note: Password is masked for security - never expose actual credentials
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
      smtpPassword: settings.smtpPassword ? "••••••••••••" : null, // Never expose actual password
      senderEmail: settings.senderEmail,
      senderName: settings.senderName,
      useTls: settings.useTls,
      updatedAt: new Date(settings.updatedAt).toISOString(),
    };
  }

  // ============== Recipients Management ==============

  /**
   * Get email recipients for a specific user
   */
  async getRecipients(userId: string): Promise<EmailRecipient[]> {
    try {
      return await db
        .select()
        .from(emailRecipients)
        .where(eq(emailRecipients.userId, userId))
        .all();
    } catch (error) {
      logger.error("[Email Settings] Error fetching recipients:", error);
      return [];
    }
  }

  /**
   * Get all email recipients with user info (admin only)
   */
  async getAllRecipients(): Promise<EmailRecipientWithUser[]> {
    try {
      const results = await db
        .select({
          id: emailRecipients.id,
          email: emailRecipients.email,
          name: emailRecipients.name,
          autoSend: emailRecipients.autoSend,
          userId: emailRecipients.userId,
          createdAt: emailRecipients.createdAt,
          userName: user.name,
          userEmail: user.email,
        })
        .from(emailRecipients)
        .leftJoin(user, eq(emailRecipients.userId, user.id))
        .all();
      return results;
    } catch (error) {
      logger.error("[Email Settings] Error fetching all recipients:", error);
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
   * Check if a recipient belongs to a user
   */
  async isRecipientOwner(
    recipientId: number,
    userId: string,
  ): Promise<boolean> {
    const recipient = await this.getRecipient(recipientId);
    return recipient?.userId === userId;
  }

  /**
   * Add a new email recipient for a user
   */
  async addRecipient(
    userId: string,
    email: string,
    name?: string | null,
    autoSend?: boolean,
  ): Promise<EmailRecipient> {
    const result = await db
      .insert(emailRecipients)
      .values({
        userId,
        email,
        name: name ?? null,
        autoSend: autoSend ?? false,
        createdAt: Date.now(),
      })
      .returning();

    logger.info(
      `[Email Settings] Added recipient: ${email} for user: ${userId}`,
    );

    // Send notification for new email recipient
    const userResult = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const emailUser = userResult[0];

    await appriseService.send("email_recipient_added", {
      recipientEmail: email,
      recipientName: name,
      userName: emailUser?.name || emailUser?.email || "Unknown user",
    });

    return result[0];
  }

  /**
   * Update an email recipient
   */
  async updateRecipient(
    id: number,
    updates: { email?: string; name?: string | null; autoSend?: boolean },
  ): Promise<EmailRecipient | null> {
    const existing = await this.getRecipient(id);
    if (!existing) {
      return null;
    }

    const result = await db
      .update(emailRecipients)
      .set({
        email: updates.email ?? existing.email,
        name: updates.name !== undefined ? updates.name : existing.name,
        autoSend: updates.autoSend ?? existing.autoSend,
      })
      .where(eq(emailRecipients.id, id))
      .returning();

    logger.info(`[Email Settings] Updated recipient: ${id}`);
    return result[0] || null;
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

  /**
   * Reassign a recipient to another user (admin only)
   */
  async reassignRecipient(
    id: number,
    newUserId: string,
  ): Promise<EmailRecipient | null> {
    const result = await db
      .update(emailRecipients)
      .set({ userId: newUserId })
      .where(eq(emailRecipients.id, id))
      .returning();

    if (result[0]) {
      logger.info(
        `[Email Settings] Reassigned recipient ${id} to user ${newUserId}`,
      );
    }
    return result[0] || null;
  }

  /**
   * Migrate orphan recipients (no userId) to a specific user
   * Called during setup wizard after admin creation
   */
  async migrateOrphanRecipients(adminUserId: string): Promise<number> {
    const result = await db
      .update(emailRecipients)
      .set({ userId: adminUserId })
      .where(isNull(emailRecipients.userId));

    const count = result.changes;
    if (count > 0) {
      logger.info(
        `[Email Settings] Migrated ${count} orphan recipients to admin user ${adminUserId}`,
      );
    }
    return count;
  }

  /**
   * Get recipients with auto-send enabled for a specific user
   */
  async getAutoSendRecipients(userId: string): Promise<EmailRecipient[]> {
    try {
      return await db
        .select()
        .from(emailRecipients)
        .where(
          and(
            eq(emailRecipients.userId, userId),
            eq(emailRecipients.autoSend, true),
          ),
        )
        .all();
    } catch (error) {
      logger.error(
        "[Email Settings] Error fetching auto-send recipients:",
        error,
      );
      return [];
    }
  }
}

// Export singleton instance
export const emailSettingsService = new EmailSettingsService();
