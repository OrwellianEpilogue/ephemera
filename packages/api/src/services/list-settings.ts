import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { listSettings, type ListSettings } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { getHardcoverFetcher } from "./list-fetchers/index.js";

/**
 * List fetch interval options
 */
export type ListFetchInterval = "15min" | "30min" | "1h" | "6h" | "12h" | "24h";

/**
 * Convert interval string to milliseconds
 */
export function intervalToMs(interval: ListFetchInterval): number {
  const intervals: Record<ListFetchInterval, number> = {
    "15min": 15 * 60 * 1000,
    "30min": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
  };
  return intervals[interval];
}

/**
 * List Settings Service
 * Manages admin settings for list imports
 */
class ListSettingsService {
  /**
   * Get list settings (creates default if doesn't exist)
   */
  async getSettings(): Promise<ListSettings> {
    const result = await db.select().from(listSettings).limit(1);

    if (result.length > 0) {
      // Update Hardcover fetcher with API token
      if (result[0].hardcoverApiToken) {
        getHardcoverFetcher().setApiToken(result[0].hardcoverApiToken);
      }
      return result[0];
    }

    // Create default settings
    const defaultSettings = await db
      .insert(listSettings)
      .values({
        id: 1,
        listFetchInterval: "6h",
        hardcoverApiToken: null,
        updatedAt: new Date(),
      })
      .returning();

    logger.info("[ListSettings] Created default list settings");
    return defaultSettings[0];
  }

  /**
   * Update list settings
   */
  async updateSettings(
    updates: Partial<Omit<ListSettings, "id" | "updatedAt">>,
  ): Promise<ListSettings> {
    // Ensure settings exist first
    await this.getSettings();

    // Strip "Bearer " prefix if user accidentally included it
    if (updates.hardcoverApiToken) {
      updates.hardcoverApiToken = updates.hardcoverApiToken
        .replace(/^Bearer\s+/i, "")
        .trim();
    }

    const result = await db
      .update(listSettings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(listSettings.id, 1))
      .returning();

    // Update Hardcover fetcher if API token changed
    if (updates.hardcoverApiToken !== undefined) {
      getHardcoverFetcher().setApiToken(updates.hardcoverApiToken);
    }

    logger.info("[ListSettings] Updated list settings");
    return result[0];
  }

  /**
   * Get the fetch interval in milliseconds
   */
  async getFetchIntervalMs(): Promise<number> {
    const settings = await this.getSettings();
    return intervalToMs(settings.listFetchInterval as ListFetchInterval);
  }

  /**
   * Check if Hardcover API is configured
   */
  async isHardcoverConfigured(): Promise<boolean> {
    const settings = await this.getSettings();
    return !!settings.hardcoverApiToken;
  }
}

export const listSettingsService = new ListSettingsService();
