import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  proxyAuthSettings,
  user,
  type ProxyAuthSettings,
  type User,
} from "../db/schema.js";

interface UserCacheEntry {
  user: User | null;
  expiresAt: number;
}

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

  // User lookup cache (keyed by "identifier:value")
  private userCache = new Map<string, UserCacheEntry>();
  private readonly USER_CACHE_TTL = 60000; // 1 minute cache

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
   * Clear user lookup cache
   */
  clearUserCache(): void {
    this.userCache.clear();
  }

  /**
   * Invalidate a specific user from cache
   */
  invalidateUserCache(identifier: "email" | "username", value: string): void {
    const cacheKey = `${identifier}:${value.trim().toLowerCase()}`;
    this.userCache.delete(cacheKey);
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
   * Check if an IP address is within a CIDR range (supports IPv4 and IPv6)
   */
  private isIPInCIDR(ip: string, cidr: string): boolean {
    const [network, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);

    // Detect IP version
    const isIPv6 = ip.includes(":");
    const isCIDRv6 = network.includes(":");

    // IP versions must match
    if (isIPv6 !== isCIDRv6) return false;

    if (isIPv6) {
      return this.isIPv6InCIDR(ip, network, prefix);
    } else {
      return this.isIPv4InCIDR(ip, network, prefix);
    }
  }

  /**
   * Check if an IPv4 address is within a CIDR range
   */
  private isIPv4InCIDR(ip: string, network: string, prefix: number): boolean {
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipNum = this.ipv4ToNumber(ip);
    const networkNum = this.ipv4ToNumber(network);

    if (ipNum === null || networkNum === null) return false;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (networkNum & mask);
  }

  /**
   * Check if an IPv6 address is within a CIDR range
   */
  private isIPv6InCIDR(ip: string, network: string, prefix: number): boolean {
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;

    const ipParts = this.expandIPv6(ip);
    const networkParts = this.expandIPv6(network);

    if (!ipParts || !networkParts) return false;

    // Compare bits up to the prefix length
    let bitsRemaining = prefix;
    for (let i = 0; i < 8 && bitsRemaining > 0; i++) {
      const bitsInThisGroup = Math.min(16, bitsRemaining);
      const mask =
        bitsInThisGroup === 16
          ? 0xffff
          : (0xffff << (16 - bitsInThisGroup)) & 0xffff;

      if ((ipParts[i] & mask) !== (networkParts[i] & mask)) {
        return false;
      }
      bitsRemaining -= 16;
    }

    return true;
  }

  /**
   * Expand an IPv6 address to its full 8-group representation
   * Returns array of 8 16-bit numbers, or null if invalid
   */
  private expandIPv6(ip: string): number[] | null {
    // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
    if (ip.includes(".")) {
      const lastColon = ip.lastIndexOf(":");
      const ipv4Part = ip.substring(lastColon + 1);
      const ipv4Num = this.ipv4ToNumber(ipv4Part);
      if (ipv4Num === null) return null;

      // Convert to IPv4-mapped IPv6
      const prefix = ip.substring(0, lastColon);
      const expandedPrefix = this.expandIPv6Pure(prefix + ":");
      if (!expandedPrefix) return null;

      // Replace last two groups with IPv4 representation
      expandedPrefix[6] = (ipv4Num >>> 16) & 0xffff;
      expandedPrefix[7] = ipv4Num & 0xffff;
      return expandedPrefix;
    }

    return this.expandIPv6Pure(ip);
  }

  /**
   * Expand a pure IPv6 address (no embedded IPv4)
   */
  private expandIPv6Pure(ip: string): number[] | null {
    const parts: number[] = [];

    // Handle :: expansion
    if (ip.includes("::")) {
      const [left, right] = ip.split("::");
      const leftParts = left ? left.split(":").filter(Boolean) : [];
      const rightParts = right ? right.split(":").filter(Boolean) : [];

      const missingGroups = 8 - leftParts.length - rightParts.length;
      if (missingGroups < 0) return null;

      for (const part of leftParts) {
        const num = parseInt(part, 16);
        if (isNaN(num) || num < 0 || num > 0xffff) return null;
        parts.push(num);
      }

      for (let i = 0; i < missingGroups; i++) {
        parts.push(0);
      }

      for (const part of rightParts) {
        const num = parseInt(part, 16);
        if (isNaN(num) || num < 0 || num > 0xffff) return null;
        parts.push(num);
      }
    } else {
      const groups = ip.split(":");
      if (groups.length !== 8) return null;

      for (const part of groups) {
        const num = parseInt(part, 16);
        if (isNaN(num) || num < 0 || num > 0xffff) return null;
        parts.push(num);
      }
    }

    return parts.length === 8 ? parts : null;
  }

  /**
   * Convert an IPv4 address string to a 32-bit number
   */
  private ipv4ToNumber(ip: string): number | null {
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
   * Results are cached for 1 minute
   */
  async findUserByHeader(
    headerValue: string,
    identifier: "email" | "username",
  ): Promise<User | null> {
    const normalizedValue = headerValue.trim().toLowerCase();

    if (!normalizedValue) return null;

    // Check cache first
    const cacheKey = `${identifier}:${normalizedValue}`;
    const cached = this.userCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.debug(`[PERF] Proxy auth user cache HIT for: ${cacheKey}`);
      return cached.user;
    }

    console.debug(`[PERF] Proxy auth user cache MISS for: ${cacheKey}`);

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
        // Cache the null result to avoid repeated DB lookups
        this.userCache.set(cacheKey, {
          user: null,
          expiresAt: Date.now() + this.USER_CACHE_TTL,
        });
        return null;
      }

      const foundUser = result[0];

      // Check if user is banned
      if (foundUser.banned) {
        console.warn(`[Proxy Auth] User is banned: ${foundUser.email}`);
        // Cache as null since banned users can't auth
        this.userCache.set(cacheKey, {
          user: null,
          expiresAt: Date.now() + this.USER_CACHE_TTL,
        });
        return null;
      }

      // Cache the found user
      this.userCache.set(cacheKey, {
        user: foundUser,
        expiresAt: Date.now() + this.USER_CACHE_TTL,
      });

      return foundUser;
    } catch (error) {
      console.error("[Proxy Auth] Error finding user:", error);
      return null;
    }
  }
}

// Export singleton instance
export const proxyAuthSettingsService = new ProxyAuthSettingsService();
