import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { indexerSettings, type IndexerSettings } from "../db/schema.js";
import crypto from "crypto";

class IndexerSettingsService {
  private cache: IndexerSettings | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1 minute cache

  /**
   * Generate a secure random API key
   */
  private generateApiKey(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Get indexer settings from database with caching
   */
  async getSettings(): Promise<IndexerSettings> {
    const now = Date.now();

    // Return cached settings if still valid
    if (this.cache && this.cacheExpiry > now) {
      return this.cache;
    }

    // Fetch settings from database
    const settings = await db.select().from(indexerSettings).limit(1);

    if (settings.length === 0) {
      // Create default settings with generated API keys
      const newSettings = await this.initializeSettings();
      this.cache = newSettings;
      this.cacheExpiry = now + this.CACHE_TTL;
      return newSettings;
    }

    this.cache = settings[0];
    this.cacheExpiry = now + this.CACHE_TTL;
    return settings[0];
  }

  /**
   * Initialize indexer settings with default values
   */
  private async initializeSettings(): Promise<IndexerSettings> {
    const now = Date.now();
    const homeDir = process.env.HOME || "/tmp";
    const defaultSettings = {
      id: 1,
      baseUrl: "http://localhost:8286",
      newznabEnabled: false,
      newznabApiKey: this.generateApiKey(),
      sabnzbdEnabled: false,
      sabnzbdApiKey: this.generateApiKey(),
      indexerCompletedDir: `${homeDir}/downloads/complete`,
      indexerIncompleteDir: `${homeDir}/downloads/incomplete`,
      indexerCategoryDir: false,
      indexerOnlyMode: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(indexerSettings).values(defaultSettings);
    return defaultSettings;
  }

  /**
   * Update indexer settings
   */
  async updateSettings(
    updates: Partial<Omit<IndexerSettings, "id" | "createdAt">>,
  ): Promise<IndexerSettings> {
    const now = Date.now();

    // Ensure settings exist
    await this.getSettings();

    // Generate new API keys if enabling services for the first time
    const currentSettings = await this.getSettings();
    const finalUpdates = { ...updates };

    // Generate API key if enabling Newznab and no key exists
    if (updates.newznabEnabled && !currentSettings.newznabApiKey) {
      finalUpdates.newznabApiKey = this.generateApiKey();
    }

    // Generate API key if enabling SABnzbd and no key exists
    if (updates.sabnzbdEnabled && !currentSettings.sabnzbdApiKey) {
      finalUpdates.sabnzbdApiKey = this.generateApiKey();
    }

    // Update settings
    const updatedSettings = await db
      .update(indexerSettings)
      .set({
        ...finalUpdates,
        updatedAt: now,
      })
      .where(eq(indexerSettings.id, 1))
      .returning();

    // Clear cache
    this.cache = null;
    this.cacheExpiry = 0;

    return updatedSettings[0];
  }

  /**
   * Regenerate API key for a specific service
   */
  async regenerateApiKey(
    service: "newznab" | "sabnzbd",
  ): Promise<IndexerSettings> {
    const updates: Partial<IndexerSettings> =
      service === "newznab"
        ? { newznabApiKey: this.generateApiKey() }
        : { sabnzbdApiKey: this.generateApiKey() };

    return this.updateSettings(updates);
  }

  /**
   * Validate an API key for a specific service
   */
  async validateApiKey(
    service: "newznab" | "sabnzbd",
    apiKey: string,
  ): Promise<boolean> {
    const settings = await this.getSettings();

    if (service === "newznab") {
      return settings.newznabEnabled && settings.newznabApiKey === apiKey;
    }

    return settings.sabnzbdEnabled && settings.sabnzbdApiKey === apiKey;
  }

  /**
   * Clear the cache (useful after external changes)
   */
  clearCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }
}

export const indexerSettingsService = new IndexerSettingsService();
