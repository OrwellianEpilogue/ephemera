import { CheerioCrawler, type CheerioRoot } from "crawlee";
import type { SearchQuery, Book, SearchResponse } from "@ephemera/shared";
import { getErrorMessage } from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import { searchCacheManager } from "./search-cache.js";

const BASE_URL = process.env.AA_BASE_URL;

/**
 * Transform an AA image URL to use our proxy endpoint
 * This protects client IP addresses from being exposed to AA
 *
 * TEMPORARILY DISABLED: The proxy creates connection blocking issues.
 * Browser has 6 connection limit to localhost:8286. Even with lazy loading
 * and semaphore limiting, proxy requests hold connections open while waiting,
 * which blocks pagination requests. Direct loading works fine.
 *
 * TODO: Implement proper image caching to disk, then re-enable proxy
 */
function transformImageUrlToProxy(
  originalUrl: string | undefined,
): string | undefined {
  if (!originalUrl) return undefined;

  // TEMPORARILY: Return original URL for direct loading
  return originalUrl;

  // When re-enabling proxy with caching:
  // const encodedUrl = Buffer.from(originalUrl, 'utf-8').toString('base64');
  // return `/api/proxy/image?url=${encodedUrl}`;
}
export class AAScraper {
  private lastResult: SearchResponse | null = null;

  async scrapeUrl(url: string): Promise<SearchResponse> {
    const crawlId = Math.random().toString(36).substring(7);
    logger.info(`[${crawlId}] Crawler starting for: ${url}`);

    const crawler = new CheerioCrawler({
      maxRequestRetries: 3,
      requestHandlerTimeoutSecs: 30,
      maxConcurrency: 1,
      useSessionPool: false,

      // Add headers to look like a regular browser
      additionalMimeTypes: ["application/json"],
      preNavigationHooks: [
        async ({ request }) => {
          logger.info(`[${crawlId}] Sending HTTP request...`);
          request.headers = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
          };
        },
      ],

      requestHandler: async ({ $, _request, _log }) => {
        logger.info(`[${crawlId}] HTTP response received, parsing HTML...`);

        // Parse the page
        const parseStart = Date.now();
        const books = AAScraper.parseBooks($);
        const pagination = AAScraper.parsePagination($);
        const parseDuration = Date.now() - parseStart;

        logger.info(
          `[${crawlId}] Parsed ${books.length} books in ${parseDuration}ms`,
        );

        // Store result for retrieval
        this.lastResult = {
          results: books,
          pagination,
        };
      },

      failedRequestHandler: async ({ request }, error) => {
        // Only log non-network errors (network errors are expected from AA)
        const isNetworkError =
          error.message?.includes("terminated") ||
          error.message?.includes("socket") ||
          error.message?.includes("ECONNREFUSED");

        if (!isNetworkError) {
          logger.error(
            `[${crawlId}] Request ${request.url} failed:`,
            error.message,
          );
        } else {
          logger.warn(
            `[${crawlId}] Network error (expected): ${error.message}`,
          );
        }

        // Don't throw - return empty result instead
        this.lastResult = {
          results: [],
          pagination: {
            page: 1,
            per_page: 50,
            has_next: false,
            has_previous: false,
            estimated_total_results: null,
          },
        };
      },
    });

    // Clear previous result
    this.lastResult = null;

    try {
      // Run crawler - add unique ID to bypass Crawlee's deduplication
      // We handle caching at the database level, so Crawlee's deduplication interferes
      const uniqueUrl = `${url}${url.includes("?") ? "&" : "?"}_crawl=${Date.now()}`;
      const crawlerStart = Date.now();
      await crawler.run([uniqueUrl]);
      logger.info(
        `[${crawlId}] Crawler completed in ${Date.now() - crawlerStart}ms`,
      );
    } catch (error: unknown) {
      // Only log unexpected errors (socket/network errors are expected from AA)
      const errorMessage = getErrorMessage(error);
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code: unknown }).code
          : undefined;
      const isNetworkError =
        errorMessage.includes("terminated") ||
        errorMessage.includes("socket") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorCode === "UND_ERR_SOCKET";

      if (!isNetworkError) {
        logger.warn(`[${crawlId}] Crawler error for ${url}:`, errorMessage);
      } else {
        logger.warn(`[${crawlId}] Network error (expected): ${errorMessage}`);
      }

      // Return empty result if crawler completely fails
      if (!this.lastResult) {
        logger.warn(`[${crawlId}] No results available, returning empty`);
        return {
          results: [],
          pagination: {
            page: 1,
            per_page: 50,
            has_next: false,
            has_previous: false,
            estimated_total_results: null,
          },
        };
      }
    }

    // Return result
    return (
      this.lastResult || {
        results: [],
        pagination: {
          page: 1,
          per_page: 50,
          has_next: false,
          has_previous: false,
          estimated_total_results: null,
        },
      }
    );
  }

  private static parseBooks($: CheerioRoot): Book[] {
    const books: Book[] = [];

    // Find all book result containers - these have the flex pt-3 pb-3 classes
    const containers = $("div.flex")
      .filter((i, el) => {
        const className = $(el).attr("class") || "";
        return className.includes("pt-3") && className.includes("pb-3");
      })
      .toArray();

    for (const containerEl of containers) {
      const container = $(containerEl);

      // Find MD5 link within this container
      const md5Link = container.find('a[href*="/md5/"]').first();
      const md5Match = md5Link.attr("href")?.match(/\/md5\/([a-f0-9]{32})/);

      if (!md5Match) continue;
      const md5 = md5Match[1];

      // Find title link (has font-semibold class)
      const titleLink = container.find("a.font-semibold").first();
      const title = titleLink.text().trim();

      if (!title || title.length < 3) continue;

      // Extract metadata
      const containerText = container.text();

      // Extract authors (look for first search link with user icon)
      const authorLink = container.find('a[href*="/search?q="]').first();
      const authorText = authorLink.text().trim();
      const authors = authorText
        ? authorText
            .split(/[,;&]/)
            .map((a) => a.trim())
            .filter((a) => a)
        : [];

      // Extract publisher/edition info (search link with company icon)
      const publisherLink = container
        .find('a[href*="/search?q="] .icon-\\[mdi--company\\]')
        .parent();
      const publisher = publisherLink.text().trim();

      // Extract description (skip the filename div which also has line-clamp)
      const descDiv = container
        .find('div[class*="line-clamp"]')
        .not(".font-mono")
        .first();
      const description = descDiv.text().trim();

      // Extract cover URL and transform it to use our proxy
      const img = container.find("img").first();
      const originalCoverUrl = img.attr("src");
      const coverUrl = transformImageUrlToProxy(originalCoverUrl);

      // Extract filename (just the basename, not full path)
      const filenameDiv = container.find('div[class*="font-mono"]').first();
      const fullPath = filenameDiv.text().trim();
      // Extract just filename from path (handles both / and \ separators)
      const filename = fullPath.split(/[/\\]/).pop() || fullPath;

      // Parse metadata from text
      const languageMatch = containerText.match(
        /([A-Za-z]+)\s*\[([a-z]{2,3})\]/,
      );
      const language = languageMatch ? languageMatch[2] : undefined;

      const formatMatch = containerText.match(
        /·\s*(PDF|EPUB|MOBI|ZIP|AZW3|FB2|TXT)\s*·/i,
      );
      const format = formatMatch ? formatMatch[1].toUpperCase() : undefined;

      // Parse size and convert to bytes (integer)
      const sizeMatch = containerText.match(/·\s*([\d.]+)\s*([KMG]?B)\s*·/);
      let size: number | undefined = undefined;
      if (sizeMatch) {
        const value = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();

        // Convert to bytes
        if (unit === "GB") {
          size = Math.round(value * 1024 * 1024 * 1024);
        } else if (unit === "MB") {
          size = Math.round(value * 1024 * 1024);
        } else if (unit === "KB") {
          size = Math.round(value * 1024);
        } else if (unit === "B") {
          size = Math.round(value);
        }
      }

      const yearMatch = containerText.match(/·\s*(19|20)\d{2}\s*·/);
      const year = yearMatch
        ? parseInt(yearMatch[0].replace(/·/g, "").trim())
        : undefined;

      // Match any content type emoji: 📘 (non-fiction), 📕 (fiction), 📗 (unknown), 📰 (magazine), 💬 (comic), 📝 (standards), 🎶 (musical), 🤨 (other)
      const contentTypeMatch = containerText.match(
        /(📘|📕|📗|📰|💬|📝|🎶|🤨)\s*(Book\s*\([^)]+\)|Magazine|Comic\s*book|Standards\s*document|Musical\s*score|Other)/i,
      );
      const contentType = contentTypeMatch ? contentTypeMatch[2] : undefined;

      // Extract source(s) - can be multiple sources separated by slashes (e.g., "lgli/zlib")
      const sourceMatch = containerText.match(/🚀\/([a-z/]+)/);
      const source = sourceMatch ? sourceMatch[1] : undefined;

      // Extract stats from DOM (downloads, lists, issues)
      const statsDiv = container.find("span.text-xs.text-gray-500").first();

      // Downloads/Saves
      const downloadsSpan = statsDiv.find('span[title="Downloads"]');
      const downloadsText = downloadsSpan.text().trim();
      const saves = downloadsText
        ? parseInt(downloadsText.replace(/[,.\s]/g, "")) || undefined
        : undefined;

      // Lists
      const listsSpan = statsDiv.find('span[title="Lists"]');
      const listsText = listsSpan.text().trim();
      const lists = listsText ? parseInt(listsText) || undefined : undefined;

      // Issues
      const issuesSpan = statsDiv.find('span[title="File issues"]');
      const issuesText = issuesSpan.text().trim();
      const issues = issuesText ? parseInt(issuesText) || undefined : undefined;

      books.push({
        md5,
        title,
        authors: authors.length > 0 ? authors : undefined,
        publisher: publisher || undefined,
        description: description || undefined,
        coverUrl: coverUrl || undefined,
        filename: filename || undefined,
        language,
        format,
        size,
        year,
        contentType,
        source,
        saves,
        lists,
        issues,
      });
    }

    return books;
  }

  private static parsePagination($: CheerioRoot): {
    page: number;
    per_page: number;
    has_next: boolean;
    has_previous: boolean;
    estimated_total_results: number | null;
  } {
    // Find current page (the link with aria-current="page")
    const currentPageLink = $('a[aria-current="page"]').first();
    const currentText = currentPageLink.text().trim();
    const page = currentText ? parseInt(currentText) || 1 : 1;

    // Check for Next button - look for link containing "Next" text
    const nextLink = $('a.js-pagination-next-page, a:contains("Next")').first();
    const has_next = nextLink.length > 0 && nextLink.attr("href") !== undefined;

    // Check for Previous button - look for link containing "Previous" text that's not disabled
    const prevLink = $(
      'a.js-pagination-prev-page, a:contains("Previous")',
    ).first();
    const has_previous =
      prevLink.length > 0 && prevLink.attr("href") !== undefined;

    // Extract estimated total from "RESULTS X-Y (Z+ TOTAL)"
    const bodyText = $("body").text();
    const resultsMatch = bodyText.match(
      /RESULTS\s+\d+-\d+\s+\((\d+)\+?\s+TOTAL\)/i,
    );
    const estimated_total_results = resultsMatch
      ? parseInt(resultsMatch[1])
      : null;

    return {
      page,
      per_page: 50, // AA shows 50 results per page
      has_next,
      has_previous,
      estimated_total_results,
    };
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const searchId = Math.random().toString(36).substring(7);

    // Check cache first
    logger.info(`[${searchId}] Checking cache for page ${query.page}...`);
    const cacheStart = Date.now();
    const cached = await searchCacheManager.get(query);
    const cacheDuration = Date.now() - cacheStart;

    if (cached) {
      logger.info(
        `[${searchId}] Cache hit! (${cacheDuration}ms) - returning ${cached.results.length} results`,
      );
      return cached;
    }

    logger.info(`[${searchId}] Cache miss (${cacheDuration}ms)`);

    // Cache miss - scrape the page
    const url = this.buildSearchUrl(query);
    logger.info(`[${searchId}] URL: ${url}`);

    const result = await this.scrapeUrl(url);

    if (result.results.length === 0) {
      logger.warn(`[${searchId}] No results found`);
    } else {
      logger.success(`[${searchId}] Found ${result.results.length} books`);

      // Cache the result
      const cacheSetStart = Date.now();
      await searchCacheManager.set(query, result);
      logger.info(
        `[${searchId}] Cached result (${Date.now() - cacheSetStart}ms)`,
      );
    }

    return result;
  }

  private buildSearchUrl(query: SearchQuery): string {
    const params = new URLSearchParams();

    // Check if we're doing an advanced search (author or title present)
    if (query.author || query.title) {
      params.append("index", "");
      params.append("page", query.page.toString());
      params.append("sort", query.sort || "");

      let termIndex = 1;
      if (query.author) {
        params.append(`termtype_${termIndex}`, "author");
        params.append(`termval_${termIndex}`, query.author);
        termIndex++;
      }
      if (query.title) {
        params.append(`termtype_${termIndex}`, "title");
        params.append(`termval_${termIndex}`, query.title);
        termIndex++;
      }

      params.append("display", "");
      params.append("q", query.q || "");
    } else {
      // Standard search
      params.append("q", query.q || "");
      params.append("page", query.page.toString());

      if (query.sort) {
        params.append("sort", query.sort);
      }
    }

    if (query.desc) {
      params.append("desc", "1");
    }

    // Handle array filters
    if (query.content) {
      query.content.forEach((c) => params.append("content", c));
    }

    if (query.ext) {
      query.ext.forEach((e) => params.append("ext", e));
    }

    if (query.acc) {
      query.acc.forEach((a) => params.append("acc", a));
    }

    if (query.src) {
      query.src.forEach((s) => params.append("src", s));
    }

    if (query.lang) {
      query.lang.forEach((l) => params.append("lang", l));
    }

    return `${BASE_URL}/search?${params.toString()}`;
  }
}

// Singleton instance
export const aaScraper = new AAScraper();
