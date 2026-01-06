import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { appriseSettings, type AppriseSettings } from "../db/schema.js";
import type { AppriseNotificationType } from "@ephemera/shared";
import { getFixedT } from "../utils/i18n.js";

export type NotificationEvent =
  | "new_request"
  | "download_error"
  | "available"
  | "delayed"
  | "update_available"
  | "request_fulfilled"
  | "book_queued"
  | "request_pending_approval"
  | "request_approved"
  | "request_rejected"
  | "list_created"
  | "tolino_configured"
  | "email_recipient_added"
  | "oidc_account_created"
  | "oidc_role_updated"
  | "service_unhealthy"
  | "service_recovered"
  | "email_sent"
  | "tolino_uploaded";

interface NotificationData {
  title: string;
  body: string;
  type: AppriseNotificationType;
}

/**
 * Apprise Notification Service
 * Manages sending notifications via Apprise server
 */
class AppriseService {
  private settingsCache: AppriseSettings | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get current Apprise settings
   * Returns defaults if not configured
   * Results are cached for 1 minute
   */
  async getSettings(): Promise<AppriseSettings> {
    // Check cache first
    if (this.settingsCache && Date.now() < this.cacheExpiry) {
      return this.settingsCache;
    }

    try {
      const result = await db
        .select()
        .from(appriseSettings)
        .where(eq(appriseSettings.id, 1))
        .limit(1);

      if (result.length === 0) {
        // Settings not initialized yet, return defaults
        return this.getDefaults();
      }

      // Cache the result
      this.settingsCache = result[0];
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return this.settingsCache;
    } catch (error) {
      console.error("[Apprise] Error fetching settings:", error);
      // Return defaults on error
      return this.getDefaults();
    }
  }

  /**
   * Get default settings
   */
  private getDefaults(): AppriseSettings {
    return {
      id: 1,
      enabled: false,
      serverUrl: null,
      customHeaders: null,
      notifyOnNewRequest: true,
      notifyOnDownloadError: true,
      notifyOnAvailable: true,
      notifyOnDelayed: true,
      notifyOnUpdateAvailable: true,
      notifyOnRequestFulfilled: true,
      notifyOnBookQueued: false,
      notifyOnRequestPendingApproval: true,
      notifyOnRequestApproved: true,
      notifyOnRequestRejected: true,
      notifyOnListCreated: true,
      notifyOnTolinoConfigured: true,
      notifyOnEmailRecipientAdded: true,
      notifyOnOidcAccountCreated: true,
      notifyOnOidcRoleUpdated: true,
      notifyOnServiceUnhealthy: true,
      notifyOnServiceRecovered: true,
      notifyOnEmailSent: false, // Default OFF - high volume
      notifyOnTolinoUploaded: false, // Default OFF - high volume
      updatedAt: Date.now(),
    };
  }

  /**
   * Update Apprise settings
   * Creates settings row if it doesn't exist
   */
  async updateSettings(
    updates: Partial<AppriseSettings>,
  ): Promise<AppriseSettings> {
    try {
      const existing = await this.getSettings();
      const settingsData = {
        ...this.getDefaults(),
        ...existing,
        ...updates,
        id: 1,
        updatedAt: Date.now(),
      };

      if (existing.id) {
        // Update existing settings
        await db
          .update(appriseSettings)
          .set(settingsData)
          .where(eq(appriseSettings.id, 1));
      } else {
        // Insert new settings
        await db.insert(appriseSettings).values(settingsData);
      }

      // Clear cache
      this.clearCache();

      // Fetch and return updated settings
      const updated = await this.getSettings();
      return updated;
    } catch (error) {
      console.error("[Apprise] Error updating settings:", error);
      throw error;
    }
  }

  /**
   * Initialize default settings if none exist
   * Called on application startup
   */
  async initializeDefaults(): Promise<void> {
    try {
      const result = await db
        .select()
        .from(appriseSettings)
        .where(eq(appriseSettings.id, 1))
        .limit(1);

      if (result.length === 0) {
        await db.insert(appriseSettings).values(this.getDefaults());
      }
    } catch (error) {
      console.error("[Apprise] Error initializing defaults:", error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Clear settings cache
   * Called when settings are updated
   */
  clearCache(): void {
    this.settingsCache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get settings for API response
   */
  async getSettingsForResponse(): Promise<
    Omit<AppriseSettings, "updatedAt"> & { updatedAt: string }
  > {
    const settings = await this.getSettings();
    return {
      ...settings,
      updatedAt: new Date(settings.updatedAt).toISOString(),
    };
  }

  /**
   * Check if notifications are enabled
   */
  async isEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.enabled && settings.serverUrl !== null;
  }

  /**
   * Check if a specific event should trigger a notification
   */
  async shouldNotify(event: NotificationEvent): Promise<boolean> {
    const settings = await this.getSettings();
    if (!settings.enabled || !settings.serverUrl) {
      return false;
    }

    const mapping: Record<NotificationEvent, keyof AppriseSettings> = {
      new_request: "notifyOnNewRequest",
      download_error: "notifyOnDownloadError",
      available: "notifyOnAvailable",
      delayed: "notifyOnDelayed",
      update_available: "notifyOnUpdateAvailable",
      request_fulfilled: "notifyOnRequestFulfilled",
      book_queued: "notifyOnBookQueued",
      request_pending_approval: "notifyOnRequestPendingApproval",
      request_approved: "notifyOnRequestApproved",
      request_rejected: "notifyOnRequestRejected",
      list_created: "notifyOnListCreated",
      tolino_configured: "notifyOnTolinoConfigured",
      email_recipient_added: "notifyOnEmailRecipientAdded",
      oidc_account_created: "notifyOnOidcAccountCreated",
      oidc_role_updated: "notifyOnOidcRoleUpdated",
      service_unhealthy: "notifyOnServiceUnhealthy",
      service_recovered: "notifyOnServiceRecovered",
      email_sent: "notifyOnEmailSent",
      tolino_uploaded: "notifyOnTolinoUploaded",
    };

    return !!settings[mapping[event]];
  }

  /**
   * Send a notification via Apprise
   */
  async send(
    event: NotificationEvent,
    data: Record<string, unknown>,
    locale: string = "en",
  ): Promise<void> {
    try {
      // Check if we should send this notification
      if (!(await this.shouldNotify(event))) {
        return;
      }

      const settings = await this.getSettings();
      if (!settings.serverUrl) {
        console.warn(
          "[Apprise] Cannot send notification: serverUrl not configured",
        );
        return;
      }

      // Build notification content based on event type
      const t = getFixedT(locale);
      const notification = this.buildNotification(event, data, t);

      await this.sendToApprise(
        settings.serverUrl,
        notification,
        settings.customHeaders,
      );
      console.log(
        `[Apprise] Sent ${event} notification [${locale}]: ${notification.title}`,
      );
    } catch (error) {
      // Log error but don't throw - notifications shouldn't break core functionality
      console.error(`[Apprise] Failed to send ${event} notification:`, error);
    }
  }

  /**
   * Build notification content based on event type and data
   */
  private buildNotification(
    event: NotificationEvent,
    data: Record<string, unknown>,
    t: (key: string, params?: Record<string, unknown>) => string,
  ): NotificationData {
    const prefix = t("prefix");
    // Helper to format book info with author(s)
    const formatBookInfo = (
      title: string,
      authors?: string | string[],
    ): string => {
      const authorStr = Array.isArray(authors) ? authors.join(", ") : authors;
      if (title && authorStr)
        return t("parts.book_by", { title, author: authorStr });
      return title || t("parts.unknown_book");
    };

    switch (event) {
      case "new_request":
        return {
          title: t("events.new_request.title", { prefix }),
          body: t("events.new_request.body", {
            query: data.query || "...",
            userInfo: data.username ? t("parts.by") + data.username : "",
            listInfo: data.listName
              ? t("parts.from_list", {
                  listName: data.listName,
                  source: data.listServiceName,
                })
              : "",
          }),
          type: "info",
        };

      case "download_error":
        return {
          title: t("events.download_error.title", { prefix }),
          body: t("events.download_error.body", {
            bookInfo: formatBookInfo(
              data.title as string,
              data.authors as string | string[],
            ),
            error: data.error || "...",
          }),
          type: "failure",
        };

      case "available":
        return {
          title: t("events.available.title", { prefix }),
          body: t("events.available.body", {
            bookInfo: formatBookInfo(
              data.title as string,
              data.authors as string | string[],
            ),
            formatInfo: data.format
              ? t("parts.format_info", { format: data.format })
              : "",
          }),
          type: "success",
        };

      case "delayed":
        return {
          title: t("events.delayed.title", { prefix }),
          body: t("events.delayed.body", {
            bookInfo: formatBookInfo(
              data.title as string,
              data.authors as string | string[],
            ),
            nextRetry: data.nextRetryAt
              ? new Date(data.nextRetryAt as number).toLocaleString()
              : "...",
          }),
          type: "warning",
        };

      case "update_available":
        return {
          title: t("events.update_available.title", { prefix }),
          body: t("events.update_available.body", {
            latestVersion: data.latestVersion,
            currentVersion: data.currentVersion,
          }),
          type: "info",
        };

      case "request_fulfilled": {
        // Build request description from available fields
        let requestDescription = data.query as string;
        if (!requestDescription) {
          const parts = [];
          if (data.title) parts.push(data.title);
          if (data.author) parts.push(data.author);
          requestDescription = parts.join(", ");
        }
        return {
          title: t("events.request_fulfilled.title", { prefix }),
          body: t("events.request_fulfilled.body", {
            bookInfo: formatBookInfo(
              (data.bookTitle || data.title) as string,
              (data.bookAuthors || data.authors) as string | string[],
            ),
            requestDescription,
          }),
          type: "success",
        };
      }

      case "book_queued":
        return {
          title: t("events.book_queued.title", { prefix }),
          body: t("events.book_queued.body", {
            bookInfo: formatBookInfo(
              data.title as string,
              data.authors as string | string[],
            ),
          }),
          type: "info",
        };

      case "request_pending_approval":
        return {
          title: t("events.request_pending_approval.title", { prefix }),
          body: t("events.request_pending_approval.body", {
            user: data.requesterName || "...",
            description: data.query || data.title || "...",
          }),
          type: "info",
        };

      case "request_approved":
        return {
          title: t("events.request_approved.title", { prefix }),
          body: t("events.request_approved.body", {
            query: data.query || data.title || "...",
          }),
          type: "success",
        };

      case "request_rejected":
        return {
          title: t("events.request_rejected.title", { prefix }),
          body: t("events.request_rejected.body", {
            query: data.query || data.title || "...",
            reason: data.reason ? t("parts.reason_prefix") + data.reason : "",
          }),
          type: "warning",
        };

      case "list_created":
        return {
          title: t("events.list_created.title", { prefix }),
          body: t("events.list_created.body", {
            listName: data.listName,
            source: data.source,
            userName: data.userName,
          }),
          type: "info",
        };

      case "tolino_configured":
        return {
          title: t("events.tolino_configured.title", { prefix }),
          body: t("events.tolino_configured.body", {
            userName: data.userName,
            reseller: data.reseller,
          }),
          type: "info",
        };

      case "email_recipient_added":
        return {
          title: t("events.email_recipient_added.title", { prefix }),
          body: t("events.email_recipient_added.body", {
            userName: data.userName,
            recipient: data.recipientName || data.recipientEmail,
          }),
          type: "info",
        };

      case "oidc_account_created":
        return {
          title: t("events.oidc_account_created.title", { prefix }),
          body: t("events.oidc_account_created.body", {
            userName: data.userName,
            email: data.email,
            providerName: data.providerName,
          }),
          type: "info",
        };

      case "oidc_role_updated":
        return {
          title: t("events.oidc_role_updated.title", { prefix }),
          body: t("events.oidc_role_updated.body", {
            userName: data.userName,
            oldRole: data.oldRole,
            newRole: data.newRole,
            groupClaim: data.groupClaim,
          }),
          type: "info",
        };

      case "service_unhealthy":
        return {
          title: t("events.service_unhealthy.title", { prefix }),
          body: t("events.service_unhealthy.body", {
            reason: data.reason || "",
          }),
          type: "warning",
        };

      case "service_recovered":
        return {
          title: t("events.service_recovered.title", { prefix }),
          body: t("events.service_recovered.body"),
          type: "success",
        };

      case "email_sent":
        return {
          title: t("events.email_sent.title", { prefix }),
          body: t("events.email_sent.body", {
            bookInfo: formatBookInfo(
              data.bookTitle as string,
              data.bookAuthors as string | string[],
            ),
            recipient: data.recipientName || data.recipientEmail,
          }),
          type: "success",
        };

      case "tolino_uploaded":
        return {
          title: t("events.tolino_uploaded.title", { prefix }),
          body: t("events.tolino_uploaded.body", {
            bookInfo: formatBookInfo(
              data.bookTitle as string,
              data.bookAuthors as string | string[],
            ),
            collectionInfo: data.collectionName
              ? t("parts.collection_info", { name: data.collectionName })
              : "",
          }),
          type: "success",
        };

      default:
        return {
          title: `${prefix}: Notification`,
          body: "...",
          type: "info",
        };
    }
  }

  /**
   * Send notification to Apprise server
   */
  private async sendToApprise(
    serverUrl: string,
    notification: NotificationData,
    customHeaders: Record<string, string> | null,
  ): Promise<void> {
    const formData = new FormData();
    formData.append("title", notification.title);
    formData.append("body", notification.body);
    formData.append("type", notification.type);
    formData.append("tags", "all");

    // Add custom headers if provided
    const headers: Record<string, string> = { ...customHeaders };

    const response = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Apprise server returned ${response.status}: ${errorText}`,
      );
    }
  }

  /**
   * Send a test notification
   */
  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const settings = await this.getSettings();

      if (!settings.serverUrl) {
        return {
          success: false,
          message: "Apprise server URL not configured",
        };
      }

      // Send test notification
      await this.sendToApprise(
        settings.serverUrl,
        {
          title: "Test Notification",
          body: "Test notification from Ephemera",
          type: "info",
        },
        settings.customHeaders,
      );

      return {
        success: true,
        message: "Test notification sent successfully",
      };
    } catch (error) {
      console.error("[Apprise] Test notification failed:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}

// Export singleton instance
export const appriseService = new AppriseService();
