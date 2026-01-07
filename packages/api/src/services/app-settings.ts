import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { appSettings, type AppSettings } from "../db/schema.js";

/**
 * App Settings Service
 * Manages application-wide settings stored in database
 * Always returns defaults if not configured
 */
class AppSettingsService {
  private settingsCache: AppSettings | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get current app settings
   * Returns defaults if not configured
   * Results are cached for 1 minute
   */
  async getSettings(): Promise<AppSettings> {
    // Check cache first
    if (this.settingsCache && Date.now() < this.cacheExpiry) {
      return this.settingsCache;
    }

    try {
      const result = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.id, 1))
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
      console.error("[App Settings] Error fetching settings:", error);
      // Return defaults on error
      return this.getDefaults();
    }
  }

  /**
   * Get default settings
   */
  private getDefaults(): AppSettings {
    return {
      id: 1,
      postDownloadAction: null, // Legacy field
      postDownloadMoveToIngest: true,
      postDownloadUploadToBooklore: false,
      postDownloadMoveToIndexer: false,
      postDownloadKeepInDownloads: false,
      postDownloadNormalizeEpub: true,
      postDownloadConvertFormat: null,
      bookRetentionDays: 30,
      bookSearchCacheDays: 7,
      requestCheckInterval: "6h",
      locale: "en",
      timeFormat: "24h",
      dateFormat: "eur",
      libraryUrl: null,
      libraryLinkLocation: "sidebar",
      downloadsPaused: false,
      updatedAt: Date.now(),
    };
  }

  /**
   * Update app settings
   * Creates settings row if it doesn't exist
   */
  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    try {
      const existing = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.id, 1))
        .limit(1);

      const settingsData = {
        id: 1,
        postDownloadAction: null, // Legacy field - always null after migration
        postDownloadMoveToIngest:
          updates.postDownloadMoveToIngest ??
          existing[0]?.postDownloadMoveToIngest ??
          true,
        postDownloadUploadToBooklore:
          updates.postDownloadUploadToBooklore ??
          existing[0]?.postDownloadUploadToBooklore ??
          false,
        postDownloadMoveToIndexer:
          updates.postDownloadMoveToIndexer ??
          existing[0]?.postDownloadMoveToIndexer ??
          false,
        postDownloadKeepInDownloads:
          updates.postDownloadKeepInDownloads ??
          existing[0]?.postDownloadKeepInDownloads ??
          false,
        postDownloadNormalizeEpub:
          updates.postDownloadNormalizeEpub ??
          existing[0]?.postDownloadNormalizeEpub ??
          true,
        postDownloadConvertFormat:
          updates.postDownloadConvertFormat !== undefined
            ? updates.postDownloadConvertFormat
            : (existing[0]?.postDownloadConvertFormat ?? null),
        bookRetentionDays:
          updates.bookRetentionDays ?? existing[0]?.bookRetentionDays ?? 30,
        bookSearchCacheDays:
          updates.bookSearchCacheDays ?? existing[0]?.bookSearchCacheDays ?? 7,
        requestCheckInterval:
          updates.requestCheckInterval ??
          existing[0]?.requestCheckInterval ??
          "6h",
        timeFormat: updates.timeFormat ?? existing[0]?.timeFormat ?? "24h",
        dateFormat: updates.dateFormat ?? existing[0]?.dateFormat ?? "eur",
        libraryUrl:
          updates.libraryUrl !== undefined
            ? updates.libraryUrl
            : (existing[0]?.libraryUrl ?? null),
        libraryLinkLocation:
          updates.libraryLinkLocation ??
          existing[0]?.libraryLinkLocation ??
          "sidebar",
        downloadsPaused:
          updates.downloadsPaused ?? existing[0]?.downloadsPaused ?? false,
        updatedAt: Date.now(),
      };

      if (existing.length > 0) {
        // Update existing settings
        await db
          .update(appSettings)
          .set(settingsData)
          .where(eq(appSettings.id, 1));
      } else {
        // Insert new settings
        await db.insert(appSettings).values(settingsData);
      }

      // Clear cache
      this.clearCache();

      // Fetch and return updated settings
      const updated = await this.getSettings();
      return updated;
    } catch (error) {
      console.error("[App Settings] Error updating settings:", error);
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
        .from(appSettings)
        .where(eq(appSettings.id, 1))
        .limit(1);

      if (result.length === 0) {
        console.log(
          "[App Settings] Initializing default settings (moveToIngest=true, uploadToBooklore=false, moveToIndexer=false, keepInDownloads=false, normalizeEpub=true, convertFormat=null, bookRetentionDays=30, bookSearchCacheDays=7, requestCheckInterval=6h, timeFormat=24h, dateFormat=eur, downloadsPaused=false)",
        );
        await db.insert(appSettings).values({
          id: 1,
          postDownloadAction: null, // Legacy field
          postDownloadMoveToIngest: true,
          postDownloadUploadToBooklore: false,
          postDownloadMoveToIndexer: false,
          postDownloadKeepInDownloads: false,
          postDownloadNormalizeEpub: true,
          postDownloadConvertFormat: null,
          bookRetentionDays: 30,
          bookSearchCacheDays: 7,
          requestCheckInterval: "6h",
          timeFormat: "24h",
          dateFormat: "eur",
          libraryUrl: null,
          libraryLinkLocation: "sidebar",
          downloadsPaused: false,
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("[App Settings] Error initializing defaults:", error);
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
   * Check if downloads are paused
   */
  async isPaused(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.downloadsPaused;
  }

  /**
   * Set the downloads paused state
   */
  async setPaused(paused: boolean): Promise<void> {
    await this.updateSettings({ downloadsPaused: paused });
  }

  /**
   * Get settings for API response
   */
  async getSettingsForResponse(): Promise<
    Omit<AppSettings, "updatedAt"> & { updatedAt: string }
  > {
    const settings = await this.getSettings();
    return {
      ...settings,
      updatedAt: new Date(settings.updatedAt).toISOString(),
    };
  }
}

// Export singleton instance
export const appSettingsService = new AppSettingsService();
