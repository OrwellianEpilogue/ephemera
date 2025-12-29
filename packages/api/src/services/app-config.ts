import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { appConfig, type AppConfig } from "../db/schema.js";
import { logger } from "../utils/logger.js";

// Domain fallback configurations
const SEARCHER_FALLBACK_TLDS = [".org", ".se", ".li"];
const QUICK_FALLBACK_TLDS = [".bz", ".la", ".gl", ".vg", ".li"];

/**
 * Replace the TLD of a URL with a new one
 */
function replaceUrlTld(url: string, newTld: string): string {
  const urlObj = new URL(url);
  const hostParts = urlObj.hostname.split(".");
  // Replace last part (TLD)
  hostParts[hostParts.length - 1] = newTld.replace(".", "");
  urlObj.hostname = hostParts.join(".");
  return urlObj.toString().replace(/\/$/, ""); // Remove trailing slash
}

/**
 * Get all TLD variants of a URL based on fallback list
 */
function getUrlVariants(baseUrl: string, fallbackTlds: string[]): string[] {
  const variants: string[] = [baseUrl];

  for (const tld of fallbackTlds) {
    const variant = replaceUrlTld(baseUrl, tld);
    if (!variants.includes(variant)) {
      variants.push(variant);
    }
  }

  return variants;
}

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
        | "searcherBaseUrl"
        | "searcherApiKey"
        | "quickBaseUrl"
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

      const configData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // Only update fields that are explicitly provided (including null)
      if (updates.searcherBaseUrl !== undefined) {
        configData.searcherBaseUrl = updates.searcherBaseUrl;
      }
      if (updates.searcherApiKey !== undefined) {
        configData.searcherApiKey = updates.searcherApiKey;
      }
      if (updates.quickBaseUrl !== undefined) {
        configData.quickBaseUrl = updates.quickBaseUrl;
      }
      if (updates.downloadFolder !== undefined) {
        configData.downloadFolder = updates.downloadFolder;
      }
      if (updates.ingestFolder !== undefined) {
        configData.ingestFolder = updates.ingestFolder;
      }
      if (updates.retryAttempts !== undefined) {
        configData.retryAttempts = updates.retryAttempts;
      }
      if (updates.requestTimeout !== undefined) {
        configData.requestTimeout = updates.requestTimeout;
      }
      if (updates.searchCacheTtl !== undefined) {
        configData.searchCacheTtl = updates.searchCacheTtl;
      }
      if (updates.maxConcurrentDownloads !== undefined) {
        configData.maxConcurrentDownloads = updates.maxConcurrentDownloads;
      }

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
    searcherBaseUrl: string | null;
    searcherApiKey: string | null;
    quickBaseUrl: string | null;
    downloadFolder: string;
    ingestFolder: string;
    retryAttempts: number;
    requestTimeout: number;
    searchCacheTtl: number;
    maxConcurrentDownloads: number;
  }> {
    const config = await this.getConfig();
    return {
      searcherBaseUrl: config.searcherBaseUrl,
      searcherApiKey: config.searcherApiKey,
      quickBaseUrl: config.quickBaseUrl,
      downloadFolder: config.downloadFolder,
      ingestFolder: config.ingestFolder,
      retryAttempts: config.retryAttempts,
      requestTimeout: config.requestTimeout,
      searchCacheTtl: config.searchCacheTtl,
      maxConcurrentDownloads: config.maxConcurrentDownloads,
    };
  }

  /**
   * Get searcher base URL from config
   */
  async getSearcherBaseUrl(): Promise<string | null> {
    const config = await this.getConfig();
    return config.searcherBaseUrl;
  }

  /**
   * Get searcher API key from config
   */
  async getSearcherApiKey(): Promise<string | null> {
    const config = await this.getConfig();
    return config.searcherApiKey;
  }

  /**
   * Get quick download base URL from config
   */
  async getQuickBaseUrl(): Promise<string | null> {
    const config = await this.getConfig();
    return config.quickBaseUrl;
  }

  /**
   * Get all searcher URL variants (original + fallback TLDs)
   * Returns empty array if no URL configured
   */
  async getSearcherUrlVariants(): Promise<string[]> {
    const baseUrl = await this.getSearcherBaseUrl();
    if (!baseUrl) return [];
    return getUrlVariants(baseUrl, SEARCHER_FALLBACK_TLDS);
  }

  /**
   * Get all quick download URL variants (original + fallback TLDs)
   * Returns empty array if no URL configured
   */
  async getQuickUrlVariants(): Promise<string[]> {
    const baseUrl = await this.getQuickBaseUrl();
    if (!baseUrl) return [];
    return getUrlVariants(baseUrl, QUICK_FALLBACK_TLDS);
  }

  /**
   * Update searcher base URL (used when fallback succeeds)
   */
  async updateSearcherBaseUrl(newUrl: string): Promise<void> {
    const currentUrl = await this.getSearcherBaseUrl();
    if (currentUrl !== newUrl) {
      logger.info(
        `[App Config] Updating searcher URL: ${currentUrl} -> ${newUrl}`,
      );
      await this.updateConfig({ searcherBaseUrl: newUrl });
    }
  }

  /**
   * Update quick download base URL (used when fallback succeeds)
   */
  async updateQuickBaseUrl(newUrl: string): Promise<void> {
    const currentUrl = await this.getQuickBaseUrl();
    if (currentUrl !== newUrl) {
      logger.info(
        `[App Config] Updating quick download URL: ${currentUrl} -> ${newUrl}`,
      );
      await this.updateConfig({ quickBaseUrl: newUrl });
    }
  }
}

// Export singleton instance
export const appConfigService = new AppConfigService();
