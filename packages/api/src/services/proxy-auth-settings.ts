import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  proxyAuthSettings,
  user,
  type ProxyAuthSettings,
  type User,
} from "../db/schema.js";

/**
 * Proxy Auth Settings Service
 * Manages reverse proxy authentication settings (trusted header auth)
 *
 * Security Notes:
 * - Only accepts auth headers from configured trusted proxy IPs
 * - Only authenticates pre-existing users (no auto-provisioning)
 * - Only works for web UI requests, NOT API routes
 */
class ProxyAuthSettingsService {
  private settingsCache: ProxyAuthSettings | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get current proxy auth settings
   * Returns defaults if not configured
   * Results are cached for 1 minute
   */
  async getSettings(): Promise<ProxyAuthSettings> {
    // Check cache first
    if (this.settingsCache && Date.now() < this.cacheExpiry) {
      return this.settingsCache;
    }

    try {
      const result = await db
        .select()
        .from(proxyAuthSettings)
        .where(eq(proxyAuthSettings.id, 1))
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
      console.error("[Proxy Auth] Error fetching settings:", error);
      // Return defaults on error
      return this.getDefaults();
    }
  }

  /**
   * Get default settings (disabled by default)
   */
  private getDefaults(): ProxyAuthSettings {
    return {
      id: 1,
      enabled: false,
      headerName: "Remote-User",
      userIdentifier: "email",
      trustedProxies: "",
      logoutRedirectUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Update proxy auth settings
   * Creates settings row if it doesn't exist
   */
  async updateSettings(
    updates: Partial<ProxyAuthSettings>,
  ): Promise<ProxyAuthSettings> {
    // Validation: if enabling, require trustedProxies
    if (updates.enabled === true) {
      const current = await this.getSettings();
      const proxies = updates.trustedProxies ?? current.trustedProxies;
      if (!proxies || proxies.trim() === "") {
        throw new Error(
          "Trusted proxies must be configured before enabling proxy auth",
        );
      }
    }

    try {
      const existing = await db
        .select()
        .from(proxyAuthSettings)
        .where(eq(proxyAuthSettings.id, 1))
        .limit(1);

      const settingsData = {
        id: 1,
        enabled: updates.enabled ?? existing[0]?.enabled ?? false,
        headerName:
          updates.headerName ?? existing[0]?.headerName ?? "Remote-User",
        userIdentifier:
          updates.userIdentifier ?? existing[0]?.userIdentifier ?? "email",
        trustedProxies:
          updates.trustedProxies ?? existing[0]?.trustedProxies ?? "",
        logoutRedirectUrl:
          updates.logoutRedirectUrl !== undefined
            ? updates.logoutRedirectUrl
            : (existing[0]?.logoutRedirectUrl ?? null),
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        // Update existing settings
        await db
          .update(proxyAuthSettings)
          .set(settingsData)
          .where(eq(proxyAuthSettings.id, 1));
      } else {
        // Insert new settings
        await db.insert(proxyAuthSettings).values({
          ...settingsData,
          createdAt: new Date(),
        });
      }

      // Clear cache
      this.clearCache();

      // Log settings change for audit
      console.log(
        `[Proxy Auth] Settings updated: enabled=${settingsData.enabled}, headerName=${settingsData.headerName}, userIdentifier=${settingsData.userIdentifier}, trustedProxies=${settingsData.trustedProxies.substring(0, 50)}...`,
      );

      // Fetch and return updated settings
      return await this.getSettings();
    } catch (error) {
      console.error("[Proxy Auth] Error updating settings:", error);
      throw error;
    }
  }

  /**
   * Clear settings cache
   */
  clearCache(): void {
    this.settingsCache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get settings for API response (with ISO date strings)
   */
  async getSettingsForResponse(): Promise<
    Omit<ProxyAuthSettings, "createdAt" | "updatedAt"> & {
      createdAt: string;
      updatedAt: string;
    }
  > {
    const settings = await this.getSettings();
    return {
      ...settings,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  /**
   * Check if an IP is in the trusted proxy list
   * Supports both individual IPs and CIDR notation
   */
  isIPTrusted(clientIP: string, trustedProxies: string): boolean {
    if (!trustedProxies.trim()) return false;

    const trustedList = trustedProxies
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const trusted of trustedList) {
      if (trusted.includes("/")) {
        // CIDR notation
        if (this.isIPInCIDR(clientIP, trusted)) return true;
      } else {
        // Exact IP match
        if (clientIP === trusted) return true;
      }
    }

    return false;
  }

  /**
   * Check if an IPv4 address is within a CIDR range
   */
  private isIPInCIDR(ip: string, cidr: string): boolean {
    const [network, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);

    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipNum = this.ipToNumber(ip);
    const networkNum = this.ipToNumber(network);

    if (ipNum === null || networkNum === null) return false;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (networkNum & mask);
  }

  /**
   * Convert an IPv4 address string to a 32-bit number
   */
  private ipToNumber(ip: string): number | null {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;

    let num = 0;
    for (const part of parts) {
      const n = parseInt(part, 10);
      if (isNaN(n) || n < 0 || n > 255) return null;
      num = (num << 8) | n;
    }
    return num >>> 0;
  }

  /**
   * Look up user by header value (email or username)
   * Returns null if user doesn't exist (no auto-provisioning)
   */
  async findUserByHeader(
    headerValue: string,
    identifier: "email" | "username",
  ): Promise<User | null> {
    const normalizedValue = headerValue.trim().toLowerCase();

    if (!normalizedValue) return null;

    try {
      // Look up by email or name depending on configuration
      const condition =
        identifier === "email"
          ? eq(user.email, normalizedValue)
          : eq(user.name, normalizedValue);

      const result = await db.select().from(user).where(condition).limit(1);

      if (result.length === 0) {
        console.warn(
          `[Proxy Auth] User not found: ${identifier}=${headerValue}`,
        );
        return null;
      }

      const foundUser = result[0];

      // Check if user is banned
      if (foundUser.banned) {
        console.warn(`[Proxy Auth] User is banned: ${foundUser.email}`);
        return null;
      }

      return foundUser;
    } catch (error) {
      console.error("[Proxy Auth] Error finding user:", error);
      return null;
    }
  }
}

// Export singleton instance
export const proxyAuthSettingsService = new ProxyAuthSettingsService();
