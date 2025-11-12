import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { bookloreSettings, type BookloreSettings } from "../db/schema.js";
import {
  login as bookloreLogin,
  type BookloreTokens,
} from "./booklore-auth.js";
import { type BookloreSettingsResponse } from "@ephemera/shared";

/**
 * Booklore settings with tokens
 */
export interface DecryptedBookloreSettings
  extends Omit<BookloreSettings, "accessToken" | "refreshToken"> {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Update settings request with plain text username/password for authentication
 * Note: Credentials are only used for authentication, never stored
 */
export interface UpdateBookloreSettingsRequest {
  enabled?: boolean;
  baseUrl?: string;
  username?: string; // For authentication only, not stored
  password?: string; // For authentication only, not stored
  libraryId?: number;
  pathId?: number;
  autoUpload?: boolean;
}

/**
 * Booklore Settings Service
 * Manages Booklore integration configuration with OAuth2 authentication
 * Stores only tokens
 */
class BookloreSettingsService {
  private settingsCache: DecryptedBookloreSettings | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get current Booklore settings with tokens
   * Returns null if not configured
   * Results are cached for 1 minute
   */
  async getSettings(): Promise<DecryptedBookloreSettings | null> {
    // Check cache first
    if (this.settingsCache && Date.now() < this.cacheExpiry) {
      return this.settingsCache;
    }

    try {
      const result = await db
        .select()
        .from(bookloreSettings)
        .where(eq(bookloreSettings.id, 1))
        .limit(1);

      if (result.length === 0) {
        // Settings not initialized yet
        this.settingsCache = null;
        return null;
      }

      const settings = result[0];

      // Cache the result
      this.settingsCache = settings;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return settings;
    } catch (error) {
      console.error("[Booklore Settings] Error fetching settings:", error);
      return null;
    }
  }

  /**
   * Check if Booklore integration is enabled and properly configured
   * Returns false if disabled or not configured
   */
  async isEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    if (!settings) {
      return false;
    }

    return (
      settings.enabled === true &&
      !!settings.baseUrl &&
      !!settings.accessToken &&
      !!settings.refreshToken &&
      settings.libraryId !== null &&
      settings.pathId !== null
    );
  }

  /**
   * Check if auto-upload is enabled
   * Returns false if Booklore is disabled or auto-upload is off
   */
  async isAutoUploadEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    if (!settings || !settings.enabled) {
      return false;
    }

    return settings.autoUpload === true;
  }

  /**
   * Validate that all required settings are present
   * Returns error message if invalid, null if valid
   */
  validateConfiguration(
    settings: UpdateBookloreSettingsRequest,
  ): string | null {
    if (settings.enabled) {
      if (!settings.baseUrl) {
        return "Base URL is required when Booklore is enabled";
      }
      if (!settings.username) {
        return "Username is required when Booklore is enabled";
      }
      if (!settings.password) {
        return "Password is required when Booklore is enabled";
      }
      if (!settings.libraryId || settings.libraryId <= 0) {
        return "Valid library ID is required when Booklore is enabled";
      }
      if (!settings.pathId || settings.pathId <= 0) {
        return "Valid path ID is required when Booklore is enabled";
      }
    }

    return null;
  }

  /**
   * Update Booklore settings with authentication
   * Authenticates with Booklore API and stores tokens
   */
  async updateSettings(
    updates: UpdateBookloreSettingsRequest,
  ): Promise<DecryptedBookloreSettings> {
    try {
      const existing = await this.getSettings();

      // Merge updates with existing settings
      const mergedUpdates: UpdateBookloreSettingsRequest = {
        enabled: updates.enabled ?? existing?.enabled ?? false,
        baseUrl: updates.baseUrl ?? existing?.baseUrl ?? undefined,
        username: updates.username, // Only for auth, not stored
        password: updates.password, // Only for auth, not stored
        libraryId: updates.libraryId ?? existing?.libraryId ?? undefined,
        pathId: updates.pathId ?? existing?.pathId ?? undefined,
        autoUpload: updates.autoUpload ?? existing?.autoUpload ?? true,
      };

      // Validate configuration
      const validationError = this.validateConfiguration(mergedUpdates);
      if (validationError) {
        throw new Error(validationError);
      }

      // Authenticate with Booklore if credentials provided
      let tokens: BookloreTokens | null = null;
      if (
        mergedUpdates.enabled &&
        mergedUpdates.baseUrl &&
        mergedUpdates.username &&
        mergedUpdates.password
      ) {
        const loginResult = await bookloreLogin(
          mergedUpdates.baseUrl,
          mergedUpdates.username,
          mergedUpdates.password,
        );

        if (!loginResult.success) {
          throw new Error(
            `Booklore authentication failed: ${loginResult.error}`,
          );
        }

        tokens = loginResult.tokens!;
      }

      // Prepare settings data - NO CREDENTIALS STORED
      // If disabling Booklore, clear all auth data for security
      if (mergedUpdates.enabled === false && existing?.accessToken) {
        console.log(
          "[Booklore Settings] Disabling Booklore - clearing all authentication data",
        );
      }

      const settingsData = {
        id: 1,
        enabled: mergedUpdates.enabled,
        baseUrl: mergedUpdates.baseUrl ?? null,
        accessToken:
          mergedUpdates.enabled === false
            ? null
            : tokens
              ? tokens.accessToken
              : (existing?.accessToken ?? null),
        refreshToken:
          mergedUpdates.enabled === false
            ? null
            : tokens
              ? tokens.refreshToken
              : (existing?.refreshToken ?? null),
        accessTokenExpiresAt:
          mergedUpdates.enabled === false
            ? null
            : tokens
              ? tokens.accessTokenExpiresAt
              : (existing?.accessTokenExpiresAt ?? null),
        refreshTokenExpiresAt:
          mergedUpdates.enabled === false
            ? null
            : tokens
              ? tokens.refreshTokenExpiresAt
              : (existing?.refreshTokenExpiresAt ?? null),
        lastTokenRefresh:
          mergedUpdates.enabled === false
            ? null
            : tokens
              ? Date.now()
              : (existing?.lastTokenRefresh ?? null),
        libraryId: mergedUpdates.libraryId ?? null,
        pathId: mergedUpdates.pathId ?? null,
        autoUpload: mergedUpdates.autoUpload,
        updatedAt: Date.now(),
      };

      if (existing) {
        // Update existing settings
        await db
          .update(bookloreSettings)
          .set(settingsData)
          .where(eq(bookloreSettings.id, 1));
      } else {
        // Insert new settings
        await db.insert(bookloreSettings).values(settingsData);
      }

      // Clear cache
      this.clearCache();

      // Fetch and return updated settings
      const updated = await this.getSettings();
      if (!updated) {
        throw new Error("Failed to fetch updated settings");
      }

      return updated;
    } catch (error) {
      console.error("[Booklore Settings] Error updating settings:", error);
      throw error;
    }
  }

  /**
   * Update access and refresh tokens after refresh
   * Called by token refresher service
   */
  async updateTokens(tokens: BookloreTokens): Promise<void> {
    try {
      await db
        .update(bookloreSettings)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
          lastTokenRefresh: Date.now(),
          updatedAt: Date.now(),
        })
        .where(eq(bookloreSettings.id, 1));

      // Clear cache so next getSettings() fetches fresh data
      this.clearCache();

      console.log("[Booklore Settings] Tokens updated successfully");
    } catch (error) {
      console.error("[Booklore Settings] Error updating tokens:", error);
      throw error;
    }
  }

  /**
   * Initialize default settings if none exist
   * Called on application startup
   */
  async initializeDefaults(): Promise<void> {
    try {
      const existing = await this.getSettings();
      if (!existing) {
        console.log(
          "[Booklore Settings] Initializing default settings (disabled)",
        );
        await db.insert(bookloreSettings).values({
          id: 1,
          enabled: false,
          autoUpload: true,
          updatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("[Booklore Settings] Error initializing defaults:", error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Disable Booklore integration and wipe all authentication data
   */
  async disable(): Promise<void> {
    try {
      await db
        .update(bookloreSettings)
        .set({
          enabled: false,
          // Clear all authentication data
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          lastTokenRefresh: null,
          updatedAt: Date.now(),
        })
        .where(eq(bookloreSettings.id, 1));

      this.clearCache();
      console.log(
        "[Booklore Settings] Booklore integration disabled and authentication data cleared",
      );
    } catch (error) {
      console.error("[Booklore Settings] Error disabling Booklore:", error);
      throw error;
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
   * Get settings for API response (shows connection status)
   */
  async getSettingsForResponse(): Promise<BookloreSettingsResponse | null> {
    const settings = await this.getSettings();
    if (!settings) {
      return null;
    }

    // Determine if connected (has valid tokens)
    const connected = !!(settings.accessToken && settings.refreshToken);

    return {
      id: settings.id,
      enabled: settings.enabled,
      baseUrl: settings.baseUrl,
      connected, // Show connection status instead of credentials
      accessTokenExpiresAt: settings.accessTokenExpiresAt,
      refreshTokenExpiresAt: settings.refreshTokenExpiresAt,
      lastTokenRefresh: settings.lastTokenRefresh,
      libraryId: settings.libraryId,
      pathId: settings.pathId,
      autoUpload: settings.autoUpload,
      updatedAt: new Date(settings.updatedAt).toISOString(),
    };
  }
}

// Export singleton instance
export const bookloreSettingsService = new BookloreSettingsService();
