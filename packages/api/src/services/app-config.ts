import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { appConfig, type AppConfig } from "../db/schema.js";

/**
 * App Config Service
 * Manages system configuration stored in database
 * (folder paths, download settings, etc.)
 */
class AppConfigService {
  private configCache: AppConfig | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get current app config
   * Results are cached for 1 minute
   */
  async getConfig(): Promise<AppConfig> {
    // Check cache first
    if (this.configCache && Date.now() < this.cacheExpiry) {
      return this.configCache;
    }

    try {
      const result = await db
        .select()
        .from(appConfig)
        .where(eq(appConfig.id, 1))
        .limit(1);

      if (result.length === 0) {
        // Config not initialized yet, return defaults
        return this.getDefaults();
      }

      // Cache the result
      this.configCache = result[0];
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return this.configCache;
    } catch (error) {
      console.error("[App Config] Error fetching config:", error);
      // Return defaults on error
      return this.getDefaults();
    }
  }

  /**
   * Get default config values
   */
  private getDefaults(): AppConfig {
    return {
      id: 1,
      isSetupComplete: false,
      authMethod: null,
      searcherBaseUrl: null,
      searcherApiKey: null,
      quickBaseUrl: null,
      downloadFolder: "./downloads",
      ingestFolder: "/path/to/final/books",
      retryAttempts: 3,
      requestTimeout: 30000,
      searchCacheTtl: 300,
      maxConcurrentDownloads: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Update app config
   */
  async updateConfig(
    updates: Partial<
      Pick<
        AppConfig,
        | "downloadFolder"
        | "ingestFolder"
        | "retryAttempts"
        | "requestTimeout"
        | "searchCacheTtl"
        | "maxConcurrentDownloads"
      >
    >,
  ): Promise<AppConfig> {
    try {
      const existing = await db
        .select()
        .from(appConfig)
        .where(eq(appConfig.id, 1))
        .limit(1);

      if (existing.length === 0) {
        throw new Error(
          "App config not initialized. Please complete setup first.",
        );
      }

      const configData = {
        downloadFolder: updates.downloadFolder ?? existing[0].downloadFolder,
        ingestFolder: updates.ingestFolder ?? existing[0].ingestFolder,
        retryAttempts: updates.retryAttempts ?? existing[0].retryAttempts,
        requestTimeout: updates.requestTimeout ?? existing[0].requestTimeout,
        searchCacheTtl: updates.searchCacheTtl ?? existing[0].searchCacheTtl,
        maxConcurrentDownloads:
          updates.maxConcurrentDownloads ?? existing[0].maxConcurrentDownloads,
        updatedAt: new Date(),
      };

      await db.update(appConfig).set(configData).where(eq(appConfig.id, 1));

      // Clear cache
      this.clearCache();

      // Fetch and return updated config
      return await this.getConfig();
    } catch (error) {
      console.error("[App Config] Error updating config:", error);
      throw error;
    }
  }

  /**
   * Clear config cache
   */
  clearCache(): void {
    this.configCache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get download folder path
   */
  async getDownloadFolder(): Promise<string> {
    const config = await this.getConfig();
    return config.downloadFolder;
  }

  /**
   * Get ingest folder path
   */
  async getIngestFolder(): Promise<string> {
    const config = await this.getConfig();
    return config.ingestFolder;
  }

  /**
   * Get retry attempts
   */
  async getRetryAttempts(): Promise<number> {
    const config = await this.getConfig();
    return config.retryAttempts;
  }

  /**
   * Get request timeout
   */
  async getRequestTimeout(): Promise<number> {
    const config = await this.getConfig();
    return config.requestTimeout;
  }

  /**
   * Get search cache TTL
   */
  async getSearchCacheTtl(): Promise<number> {
    const config = await this.getConfig();
    return config.searchCacheTtl;
  }

  /**
   * Get max concurrent downloads
   */
  async getMaxConcurrentDownloads(): Promise<number> {
    const config = await this.getConfig();
    return config.maxConcurrentDownloads;
  }

  /**
   * Get config for API response (with date formatting)
   */
  async getConfigForResponse(): Promise<{
    downloadFolder: string;
    ingestFolder: string;
    retryAttempts: number;
    requestTimeout: number;
    searchCacheTtl: number;
    maxConcurrentDownloads: number;
  }> {
    const config = await this.getConfig();
    return {
      downloadFolder: config.downloadFolder,
      ingestFolder: config.ingestFolder,
      retryAttempts: config.retryAttempts,
      requestTimeout: config.requestTimeout,
      searchCacheTtl: config.searchCacheTtl,
      maxConcurrentDownloads: config.maxConcurrentDownloads,
    };
  }
}

// Export singleton instance
export const appConfigService = new AppConfigService();
