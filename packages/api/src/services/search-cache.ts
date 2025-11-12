import { eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { searchCache, type NewSearchCache } from "../db/schema.js";
import type { SearchQuery, SearchResponse } from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import { createHash } from "crypto";

const CACHE_TTL = parseInt(process.env.SEARCH_CACHE_TTL || "300") * 1000; // Default 5 minutes in ms

export class SearchCacheManager {
  private generateQueryHash(query: SearchQuery): string {
    // Create a consistent hash from the query parameters
    const normalized = {
      q: query.q.toLowerCase().trim(),
      page: query.page || 1,
      sort: query.sort || "",
      content: query.content?.sort() || [],
      ext: query.ext?.sort() || [],
      acc: query.acc?.sort() || [],
      src: query.src?.sort() || [],
      lang: query.lang?.sort() || [],
      desc: query.desc || false,
    };

    return createHash("md5").update(JSON.stringify(normalized)).digest("hex");
  }

  async get(query: SearchQuery): Promise<SearchResponse | null> {
    try {
      const hash = this.generateQueryHash(query);
      const now = Date.now();

      const cached = await db
        .select()
        .from(searchCache)
        .where(eq(searchCache.queryHash, hash))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const entry = cached[0];

      // Check if expired
      if (entry.expiresAt < now) {
        logger.debug(`Cache expired for query: ${query.q}`);
        // Delete expired entry
        await db.delete(searchCache).where(eq(searchCache.queryHash, hash));
        return null;
      }

      logger.info(
        `Cache hit for query: ${query.q} (${entry.results.length} results)`,
      );

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results: entry.results as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pagination: entry.pagination as any,
      };
    } catch (error) {
      logger.error("Failed to get from cache:", error);
      return null;
    }
  }

  async set(query: SearchQuery, results: SearchResponse): Promise<void> {
    try {
      const hash = this.generateQueryHash(query);
      const now = Date.now();

      const cacheEntry: NewSearchCache = {
        queryHash: hash,
        query: query as Record<string, unknown>,
        results: results.results as Array<Record<string, unknown>>,
        pagination: results.pagination as Record<string, unknown>,
        cachedAt: now,
        expiresAt: now + CACHE_TTL,
      };

      // Upsert - delete old and insert new
      await db.delete(searchCache).where(eq(searchCache.queryHash, hash));
      await db.insert(searchCache).values(cacheEntry);

      logger.info(`Cached query: ${query.q} (expires in ${CACHE_TTL / 1000}s)`);
    } catch (error) {
      logger.error("Failed to set cache:", error);
    }
  }

  async cleanup(): Promise<number> {
    try {
      const now = Date.now();
      const result = await db
        .delete(searchCache)
        .where(lt(searchCache.expiresAt, now));

      return result.changes || 0;
    } catch (error) {
      logger.error("Failed to cleanup cache:", error);
      return 0;
    }
  }

  async clear(): Promise<void> {
    try {
      await db.delete(searchCache);
      logger.info("Cache cleared");
    } catch (error) {
      logger.error("Failed to clear cache:", error);
    }
  }

  async stats(): Promise<{
    total: number;
    expired: number;
    active: number;
  }> {
    try {
      const all = await db.select().from(searchCache);
      const now = Date.now();

      const expired = all.filter((entry) => entry.expiresAt < now).length;
      const active = all.length - expired;

      return {
        total: all.length,
        expired,
        active,
      };
    } catch (error) {
      logger.error("Failed to get cache stats:", error);
      return { total: 0, expired: 0, active: 0 };
    }
  }
}

export const searchCacheManager = new SearchCacheManager();
