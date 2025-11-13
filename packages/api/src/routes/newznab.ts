import { Hono } from "hono";
import { z } from "zod";
import { searchCacheManager } from "../services/search-cache.js";
import { indexerSettingsService } from "../services/indexer-settings.js";
import {
  NewznabFormatter,
  newznabFormatter,
} from "../services/newznab-formatter.js";
import { nzbGenerator } from "../services/nzb-generator.js";
import { bookRepository } from "../repositories/book.js";
import { aaScraper } from "../services/scraper.js";
import type { Book } from "../db/schema.js";
import type { SearchResponse } from "@ephemera/shared";

const newznab = new Hono();

// Query parameter schemas
const capsQuerySchema = z.object({
  t: z.literal("caps"),
  o: z.enum(["xml", "json"]).optional().default("xml"),
});

const searchQuerySchema = z.object({
  t: z.enum(["search", "book"]).optional().default("search"),
  apikey: z.string().optional(),
  q: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  o: z.enum(["xml", "json"]).optional().default("xml"),
  cat: z.string().optional(),
  maxage: z.coerce.number().optional(),
  extended: z.coerce.number().optional(),
});

const getQuerySchema = z.object({
  t: z.literal("get"),
  id: z.string(), // MD5 of the book
  apikey: z.string().optional(),
});

const rssQuerySchema = z.object({
  t: z.literal("rss"),
  apikey: z.string().optional(),
  o: z.enum(["xml", "json"]).optional().default("xml"),
});

/**
 * Main Newznab API endpoint
 */
newznab.get("/api", async (c) => {
  const query = c.req.query();

  // Check if Newznab is enabled
  const settings = await indexerSettingsService.getSettings();
  if (!settings.newznabEnabled) {
    c.status(404);
    return c.text("Not Found");
  }

  // Handle capabilities request (no auth required)
  if (query.t === "caps") {
    const params = capsQuerySchema.parse(query);
    const formatter = newznabFormatter;

    if (params.o === "json") {
      return c.json(formatter.formatCapabilitiesJson());
    } else {
      c.header("Content-Type", "application/xml");
      return c.body(formatter.formatCapabilitiesXml());
    }
  }

  // Handle RSS feed request
  if (query.t === "rss") {
    const params = rssQuerySchema.safeParse(query);
    if (!params.success) {
      const formatter = newznabFormatter;
      c.header("Content-Type", "application/xml");
      c.status(200); // Newznab always returns 200
      return c.body(formatter.formatErrorXml(200, "Missing parameter"));
    }

    // Validate API key
    if (params.data.apikey !== settings.newznabApiKey) {
      const formatter = newznabFormatter;
      if (params.data.o === "json") {
        return c.json(
          formatter.formatErrorJson(100, "Incorrect user credentials"),
        );
      } else {
        c.header("Content-Type", "application/xml");
        return c.body(
          formatter.formatErrorXml(100, "Incorrect user credentials"),
        );
      }
    }

    // Return empty RSS feed
    const formatter = new NewznabFormatter(settings.baseUrl);
    if (params.data.o === "json") {
      return c.json(
        formatter.formatSearchResultsJson([], 0, 0, params.data.apikey || ""),
      );
    } else {
      c.header("Content-Type", "application/xml");
      return c.body(
        formatter.formatSearchResultsXml(
          [],
          0,
          0,
          params.data.apikey || "",
          "",
        ),
      );
    }
  }

  // Handle NZB download request
  if (query.t === "get") {
    const params = getQuerySchema.safeParse(query);
    if (!params.success) {
      const formatter = newznabFormatter;
      c.header("Content-Type", "application/xml");
      c.status(200);
      return c.body(formatter.formatErrorXml(200, "Missing parameter"));
    }

    // Validate API key
    if (params.data.apikey !== settings.newznabApiKey) {
      const formatter = newznabFormatter;
      c.header("Content-Type", "application/xml");
      c.status(200);
      return c.body(
        formatter.formatErrorXml(100, "Incorrect user credentials"),
      );
    }

    // For NZB downloads, we still need to get the book from DB or search for it
    let book = await bookRepository.getByMd5(params.data.id);

    if (!book) {
      // Try to find it via search (in case it's not in DB yet)
      try {
        const searchResults = await aaScraper.search({
          q: params.data.id, // Search by MD5
          page: 1,
        });

        const foundBook = searchResults.results.find(
          (b) => b.md5 === params.data.id,
        );
        if (foundBook) {
          // Save to DB for future reference
          await bookRepository.upsert({
            md5: foundBook.md5,
            title: foundBook.title,
            authors: foundBook.authors,
            publisher: foundBook.publisher,
            description: foundBook.description,
            coverUrl: foundBook.coverUrl,
            filename: foundBook.filename,
            language: foundBook.language,
            format: foundBook.format,
            size: foundBook.size,
            year: foundBook.year,
            contentType: foundBook.contentType,
            source: foundBook.source,
            saves: foundBook.saves,
            lists: foundBook.lists,
            issues: foundBook.issues,
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
          });
          book = foundBook as Book; // Use the search result
        }
      } catch (error) {
        console.error("Failed to find book by MD5:", error);
      }

      if (!book) {
        const formatter = newznabFormatter;
        c.header("Content-Type", "application/xml");
        c.status(200);
        return c.body(formatter.formatErrorXml(300, "Item not found"));
      }
    }

    // Generate NZB file
    const nzb = nzbGenerator.generateNzb(book);
    c.header("Content-Type", "application/x-nzb");
    c.header("Content-Disposition", `attachment; filename="${book.md5}.nzb"`);
    return c.body(nzb);
  }

  // Handle search requests
  if (query.t === "search" || query.t === "book") {
    const params = searchQuerySchema.safeParse(query);

    // Log the request for debugging
    console.log("Newznab search request:", query);

    if (!params.success) {
      const formatter = newznabFormatter;
      c.header("Content-Type", "application/xml");
      c.status(200);
      return c.body(formatter.formatErrorXml(200, "Missing parameter"));
    }

    // Validate API key
    if (params.data.apikey !== settings.newznabApiKey) {
      const formatter = newznabFormatter;
      if (params.data.o === "json") {
        return c.json(
          formatter.formatErrorJson(100, "Incorrect user credentials"),
        );
      } else {
        c.header("Content-Type", "application/xml");
        return c.body(
          formatter.formatErrorXml(100, "Incorrect user credentials"),
        );
      }
    }

    // Build search query
    let searchQuery = "";
    if (params.data.t === "book") {
      // Book-specific search
      if (params.data.title) {
        searchQuery = params.data.title;
      }
      if (params.data.author) {
        searchQuery = searchQuery
          ? `${searchQuery} ${params.data.author}`
          : params.data.author;
      }
    } else {
      // General search
      searchQuery = params.data.q || "";
    }

    // Check if category filter is applied and if it's a book category
    if (params.data.cat) {
      const requestedCategories = params.data.cat
        .split(",")
        .map((c) => c.trim());
      const bookCategories = ["7000", "7010", "7020", "7030"];
      const hasBookCategory = requestedCategories.some((cat) =>
        bookCategories.includes(cat),
      );

      if (!hasBookCategory) {
        // Requested categories don't include books, return empty
        const formatter = newznabFormatter;
        if (params.data.o === "json") {
          return c.json(formatter.formatSearchResultsJson([], 0, 0));
        } else {
          c.header("Content-Type", "application/xml");
          return c.body(formatter.formatSearchResultsXml([], 0, 0));
        }
      }
    }

    // If no search query provided, return some recent/popular books for testing
    if (!searchQuery) {
      // For test queries, search for something generic to return results
      searchQuery = "book";
    }

    // Try to get cached results first
    const cacheKey = {
      q: searchQuery,
      page: Math.floor(params.data.offset / params.data.limit) + 1,
    };

    const cached = await searchCacheManager.get(cacheKey);
    let searchResults: SearchResponse | undefined;
    let total = 0;

    if (cached) {
      // Use cached results
      searchResults = cached;
      console.log(
        `Using cached results for "${searchQuery}": ${searchResults.results.length} books`,
      );
    } else {
      // Perform new search
      try {
        searchResults = await aaScraper.search({
          q: searchQuery,
          page: Math.floor(params.data.offset / params.data.limit) + 1,
        });

        console.log(
          `Newznab search for "${searchQuery}" returned ${searchResults.results.length} results from scraper`,
        );
        console.log(`Pagination info:`, searchResults.pagination);

        // Save to cache
        await searchCacheManager.set(cacheKey, searchResults);
      } catch (error) {
        console.error("Search error:", error);
        const formatter = newznabFormatter;
        if (params.data.o === "json") {
          return c.json(
            formatter.formatErrorJson(203, "Function not available"),
          );
        } else {
          c.header("Content-Type", "application/xml");
          return c.body(
            formatter.formatErrorXml(203, "Function not available"),
          );
        }
      }
    }

    // Use the search results directly (just like the UI does)
    const books = searchResults.results;
    total = searchResults.pagination.estimated_total_results || books.length;

    // Apply limit
    const limitedBooks = books.slice(0, params.data.limit);

    // Get base URL from settings for proper URL generation
    const indexerSettings = await indexerSettingsService.getSettings();

    // Create formatter with the configured base URL
    const formatter = new NewznabFormatter(indexerSettings.baseUrl);
    if (params.data.o === "json") {
      return c.json(
        formatter.formatSearchResultsJson(
          limitedBooks,
          params.data.offset,
          total,
          params.data.apikey || "",
        ),
      );
    } else {
      c.header("Content-Type", "application/xml");
      return c.body(
        formatter.formatSearchResultsXml(
          limitedBooks,
          params.data.offset,
          total,
          params.data.apikey || "",
          searchQuery,
        ),
      );
    }
  }

  // Unknown function
  const formatter = newznabFormatter;
  c.header("Content-Type", "application/xml");
  c.status(200);
  return c.body(formatter.formatErrorXml(203, "Function not available"));
});

export default newznab;
