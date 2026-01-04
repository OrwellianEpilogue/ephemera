import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { appriseSettings, type AppriseSettings } from "../db/schema.js";
import type { AppriseNotificationType } from "@ephemera/shared";

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
      const existing = await db
        .select()
        .from(appriseSettings)
        .where(eq(appriseSettings.id, 1))
        .limit(1);

      const settingsData = {
        id: 1,
        enabled: updates.enabled ?? existing[0]?.enabled ?? false,
        serverUrl:
          updates.serverUrl !== undefined
            ? updates.serverUrl
            : (existing[0]?.serverUrl ?? null),
        customHeaders:
          updates.customHeaders !== undefined
            ? updates.customHeaders
            : (existing[0]?.customHeaders ?? null),
        notifyOnNewRequest:
          updates.notifyOnNewRequest ?? existing[0]?.notifyOnNewRequest ?? true,
        notifyOnDownloadError:
          updates.notifyOnDownloadError ??
          existing[0]?.notifyOnDownloadError ??
          true,
        notifyOnAvailable:
          updates.notifyOnAvailable ?? existing[0]?.notifyOnAvailable ?? true,
        notifyOnDelayed:
          updates.notifyOnDelayed ?? existing[0]?.notifyOnDelayed ?? true,
        notifyOnUpdateAvailable:
          updates.notifyOnUpdateAvailable ??
          existing[0]?.notifyOnUpdateAvailable ??
          true,
        notifyOnRequestFulfilled:
          updates.notifyOnRequestFulfilled ??
          existing[0]?.notifyOnRequestFulfilled ??
          true,
        notifyOnBookQueued:
          updates.notifyOnBookQueued ??
          existing[0]?.notifyOnBookQueued ??
          false,
        notifyOnRequestPendingApproval:
          updates.notifyOnRequestPendingApproval ??
          existing[0]?.notifyOnRequestPendingApproval ??
          true,
        notifyOnRequestApproved:
          updates.notifyOnRequestApproved ??
          existing[0]?.notifyOnRequestApproved ??
          true,
        notifyOnRequestRejected:
          updates.notifyOnRequestRejected ??
          existing[0]?.notifyOnRequestRejected ??
          true,
        notifyOnListCreated:
          updates.notifyOnListCreated ??
          existing[0]?.notifyOnListCreated ??
          true,
        notifyOnTolinoConfigured:
          updates.notifyOnTolinoConfigured ??
          existing[0]?.notifyOnTolinoConfigured ??
          true,
        notifyOnEmailRecipientAdded:
          updates.notifyOnEmailRecipientAdded ??
          existing[0]?.notifyOnEmailRecipientAdded ??
          true,
        notifyOnOidcAccountCreated:
          updates.notifyOnOidcAccountCreated ??
          existing[0]?.notifyOnOidcAccountCreated ??
          true,
        notifyOnOidcRoleUpdated:
          updates.notifyOnOidcRoleUpdated ??
          existing[0]?.notifyOnOidcRoleUpdated ??
          true,
        notifyOnServiceUnhealthy:
          updates.notifyOnServiceUnhealthy ??
          existing[0]?.notifyOnServiceUnhealthy ??
          true,
        notifyOnServiceRecovered:
          updates.notifyOnServiceRecovered ??
          existing[0]?.notifyOnServiceRecovered ??
          true,
        notifyOnEmailSent:
          updates.notifyOnEmailSent ?? existing[0]?.notifyOnEmailSent ?? false,
        notifyOnTolinoUploaded:
          updates.notifyOnTolinoUploaded ??
          existing[0]?.notifyOnTolinoUploaded ??
          false,
        updatedAt: Date.now(),
      };

      if (existing.length > 0) {
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
        console.log("[Apprise] Initializing default settings (disabled)");
        await db.insert(appriseSettings).values({
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
          notifyOnEmailSent: false,
          notifyOnTolinoUploaded: false,
          updatedAt: Date.now(),
        });
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

    switch (event) {
      case "new_request":
        return settings.notifyOnNewRequest;
      case "download_error":
        return settings.notifyOnDownloadError;
      case "available":
        return settings.notifyOnAvailable;
      case "delayed":
        return settings.notifyOnDelayed;
      case "update_available":
        return settings.notifyOnUpdateAvailable;
      case "request_fulfilled":
        return settings.notifyOnRequestFulfilled;
      case "book_queued":
        return settings.notifyOnBookQueued;
      case "request_pending_approval":
        return settings.notifyOnRequestPendingApproval;
      case "request_approved":
        return settings.notifyOnRequestApproved;
      case "request_rejected":
        return settings.notifyOnRequestRejected;
      case "list_created":
        return settings.notifyOnListCreated;
      case "tolino_configured":
        return settings.notifyOnTolinoConfigured;
      case "email_recipient_added":
        return settings.notifyOnEmailRecipientAdded;
      case "oidc_account_created":
        return settings.notifyOnOidcAccountCreated;
      case "oidc_role_updated":
        return settings.notifyOnOidcRoleUpdated;
      case "service_unhealthy":
        return settings.notifyOnServiceUnhealthy;
      case "service_recovered":
        return settings.notifyOnServiceRecovered;
      case "email_sent":
        return settings.notifyOnEmailSent;
      case "tolino_uploaded":
        return settings.notifyOnTolinoUploaded;
      default:
        return false;
    }
  }

  /**
   * Send a notification via Apprise
   */
  async send(
    event: NotificationEvent,
    data: Record<string, unknown>,
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
      const notification = this.buildNotification(event, data);

      // Send via Apprise
      await this.sendToApprise(
        settings.serverUrl,
        notification,
        settings.customHeaders,
      );

      console.log(
        `[Apprise] Sent ${event} notification: ${notification.title}`,
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
  ): NotificationData {
    // Helper to format book info with author(s)
    const formatBookInfo = (
      title: string,
      authors?: string | string[],
    ): string => {
      if (authors) {
        // Handle both string and array of strings
        const authorStr = Array.isArray(authors) ? authors.join(", ") : authors;
        if (authorStr) {
          return `"${title}" by ${authorStr}`;
        }
      }
      return `"${title}"`;
    };

    switch (event) {
      case "new_request": {
        const userInfo = data.username ? ` by ${data.username}` : "";
        const listInfo = data.listName
          ? `\nFrom list: ${data.listName} (${data.listServiceName})`
          : "";
        return {
          title: "Ephemera: New Download Request Created",
          body: `Request for: ${data.query || "unknown query"}${userInfo}${listInfo}`,
          type: "info",
        };
      }

      case "download_error":
        return {
          title: "Ephemera: Download Failed",
          body: `${formatBookInfo((data.title as string) || "Unknown book", data.authors as string | string[])} failed to download\nError: ${data.error || "Unknown error"}`,
          type: "failure",
        };

      case "available":
        return {
          title: "Ephemera: Download Complete",
          body: `${formatBookInfo((data.title as string) || "Unknown book", data.authors as string | string[])} is now available${data.format ? ` (${data.format})` : ""}`,
          type: "success",
        };

      case "delayed":
        return {
          title: "Ephemera: Download Delayed - Quota Exhausted",
          body: `${formatBookInfo((data.title as string) || "Unknown book", data.authors as string | string[])} delayed due to quota limits${data.nextRetryAt ? `\nNext retry: ${new Date(data.nextRetryAt as number).toLocaleString()}` : ""}`,
          type: "warning",
        };

      case "update_available":
        return {
          title: "Ephemera: Update Available",
          body: `Version ${data.latestVersion} is now available${data.currentVersion ? ` (current: ${data.currentVersion})` : ""}`,
          type: "info",
        };

      case "request_fulfilled": {
        // Build request description from available fields
        let requestDescription = data.query as string;
        if (!requestDescription) {
          const parts = [];
          if (data.title) parts.push(`Title: "${data.title}"`);
          if (data.author) parts.push(`Author: ${data.author}`);
          requestDescription = parts.join(", ") || "unknown query";
        }

        return {
          title: "Ephemera: Request Fulfilled",
          body: `Found and queued: ${formatBookInfo((data.bookTitle as string) || "Unknown book", (data.bookAuthors || data.authors) as string | string[])}\nRequest: ${requestDescription}`,
          type: "success",
        };
      }

      case "book_queued":
        return {
          title: "Ephemera: Book Queued for Download",
          body: `${formatBookInfo((data.title as string) || "Unknown book", data.authors as string | string[])} added to download queue`,
          type: "info",
        };

      case "request_pending_approval": {
        const queryDesc =
          (data.query as string) || (data.title as string) || "unknown query";
        return {
          title: "Ephemera: Request Needs Approval",
          body: `New request from ${(data.requesterName as string) || "a user"}: ${queryDesc}`,
          type: "info",
        };
      }

      case "request_approved": {
        const queryDesc =
          (data.query as string) || (data.title as string) || "unknown query";
        return {
          title: "Ephemera: Request Approved",
          body: `Your request for "${queryDesc}" has been approved and will be processed`,
          type: "success",
        };
      }

      case "request_rejected": {
        const queryDesc =
          (data.query as string) || (data.title as string) || "unknown query";
        const reason = data.reason ? `: ${data.reason}` : "";
        return {
          title: "Ephemera: Request Rejected",
          body: `Your request for "${queryDesc}" was rejected${reason}`,
          type: "warning",
        };
      }

      case "list_created":
        return {
          title: "Ephemera: New Import List Created",
          body: `List "${data.listName}" (${data.source}) created by ${data.userName}`,
          type: "info",
        };

      case "tolino_configured":
        return {
          title: "Ephemera: Tolino Cloud Configured",
          body: `${data.userName} connected Tolino Cloud (${data.reseller})`,
          type: "info",
        };

      case "email_recipient_added":
        return {
          title: "Ephemera: Email Recipient Added",
          body: `${data.userName} added email recipient: ${data.recipientName || data.recipientEmail}`,
          type: "info",
        };

      case "oidc_account_created":
        return {
          title: "Ephemera: New User Auto-Provisioned",
          body: `User ${data.userName} (${data.email}) was created via ${data.providerName}`,
          type: "info",
        };

      case "oidc_role_updated":
        return {
          title: "Ephemera: User Role Changed",
          body: `${data.userName}'s role changed from ${data.oldRole} to ${data.newRole} (via ${data.groupClaim} claim)`,
          type: "info",
        };

      case "service_unhealthy":
        return {
          title: "Ephemera: Service Unavailable",
          body: `FlareSolverr has become unavailable.${data.reason ? `\n${data.reason}` : ""}`,
          type: "warning",
        };

      case "service_recovered":
        return {
          title: "Ephemera: Service Recovered",
          body: "FlareSolverr is available again",
          type: "success",
        };

      case "email_sent":
        return {
          title: "Ephemera: Book Sent via Email",
          body: `${formatBookInfo((data.bookTitle as string) || "Unknown book", data.bookAuthors as string | string[])} sent to ${data.recipientName || data.recipientEmail}`,
          type: "success",
        };

      case "tolino_uploaded":
        return {
          title: "Ephemera: Book Uploaded to Tolino Cloud",
          body: `${formatBookInfo((data.bookTitle as string) || "Unknown book", data.bookAuthors as string | string[])} uploaded${data.collectionName ? ` to collection "${data.collectionName}"` : ""}`,
          type: "success",
        };

      default:
        return {
          title: "Ephemera: Notification",
          body: "Unknown event",
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
    const payload = {
      ...notification,
      tags: "all",
    };

    const headers: Record<string, string> = {};
    headers["Content-Type"] = "application/json";

    // Add custom headers if provided
    if (customHeaders) {
      Object.entries(customHeaders).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    const response = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
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
