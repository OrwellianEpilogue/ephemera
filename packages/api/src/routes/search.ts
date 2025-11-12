import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { aaScraper } from "../services/scraper.js";
import {
  searchQuerySchema,
  searchResponseSchema,
  errorResponseSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import { downloadTracker } from "../services/download-tracker.js";
import { bookService } from "../services/book-service.js";

const app = new OpenAPIHono();

const searchRoute = createRoute({
  method: "get",
  path: "/search",
  tags: ["Search"],
  summary: "Search for books on AA",
  description:
    "Search for books with various filters including content type, file format, language, and more",
  request: {
    query: searchQuerySchema,
  },
  responses: {
    200: {
      description: "Successful search results",
      content: {
        "application/json": {
          schema: searchResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request parameters",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(searchRoute, async (c) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  try {
    const query = c.req.valid("query");

    logger.info(
      `[${requestId}] 📥 Search request received: "${query.q}" (page ${query.page})`,
    );

    // Scraping phase
    const scrapeStart = Date.now();
    logger.info(`[${requestId}] 🔍 Starting scrape...`);
    const results = await aaScraper.search(query);
    const scrapeDuration = Date.now() - scrapeStart;
    logger.info(
      `[${requestId}] ✅ Scrape complete (${scrapeDuration}ms) - found ${results.results.length} results`,
    );

    // Save all search results to books table in a single transaction
    // This updates lastSeenAt and increments searchCount for existing books
    try {
      const dbStart = Date.now();
      logger.info(`[${requestId}] 💾 Saving books to database...`);
      await bookService.upsertBooks(results.results);
      logger.info(
        `[${requestId}] ✅ DB save complete (${Date.now() - dbStart}ms)`,
      );
    } catch (error) {
      // Log error but don't fail the search if book save fails
      logger.error(
        `[${requestId}] ❌ Failed to save books to database:`,
        error,
      );
    }

    // Augment results with download status from downloads table
    const statusStart = Date.now();
    logger.info(`[${requestId}] 🔄 Fetching download statuses...`);
    const md5s = results.results.map((book) => book.md5);
    const downloadStatuses = await downloadTracker.getStatusByMd5s(md5s);
    logger.info(
      `[${requestId}] ✅ Got download statuses (${Date.now() - statusStart}ms)`,
    );

    // Create a map for quick lookup
    const statusMap = new Map(downloadStatuses.map((d) => [d.md5, d.status]));

    // Add downloadStatus to each book
    const augmentedResults = results.results.map((book) => ({
      ...book,
      downloadStatus: statusMap.get(book.md5) || null,
    }));

    const totalDuration = Date.now() - startTime;
    logger.info(
      `[${requestId}] 📤 Sending response (total: ${totalDuration}ms)`,
    );

    return c.json(
      {
        results: augmentedResults,
        pagination: results.pagination,
      },
      200,
    );
  } catch (error: unknown) {
    const totalDuration = Date.now() - startTime;
    logger.error(
      `[${requestId}] ❌ Search error after ${totalDuration}ms:`,
      error,
    );

    return c.json(
      {
        error: "Failed to perform search",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

export default app;
