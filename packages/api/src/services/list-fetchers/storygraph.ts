import {
  type ListFetcher,
  type FetchResult,
  type ListBook,
  type StoryGraphConfig,
  normalizeTitle,
  normalizeAuthor,
} from "./types.js";
import { logger } from "../../utils/logger.js";

const STORYGRAPH_BASE_URL = "https://app.thestorygraph.com";
const FLARESOLVERR_URL =
  process.env.FLARESOLVERR_URL || "http://localhost:8191";

// FlareSolverr API types
interface FlareSolverrRequest {
  cmd: string;
  url?: string;
  session?: string;
  maxTimeout?: number;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution?: {
    url: string;
    status: number;
    response: string;
    userAgent: string;
  };
  session?: string;
}

/**
 * StoryGraph List Fetcher
 * Scrapes the StoryGraph "to-read" page using FlareSolverr
 */
export class StoryGraphFetcher implements ListFetcher {
  readonly source = "storygraph" as const;

  /**
   * Validate StoryGraph configuration
   */
  async validateConfig(
    config: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { username } = config as unknown as StoryGraphConfig;

    if (!username) {
      return { valid: false, error: "Username is required" };
    }

    // Basic username validation
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return { valid: false, error: "Invalid username format" };
    }

    // Check if FlareSolverr is available
    try {
      const flareSolverAvailable = await this.checkFlareSolverr();
      if (!flareSolverAvailable) {
        return {
          valid: false,
          error:
            "FlareSolverr is not available. StoryGraph requires FlareSolverr to bypass protection.",
        };
      }
    } catch {
      return {
        valid: false,
        error: "Failed to connect to FlareSolverr",
      };
    }

    // Try to access the user's to-read page to validate it exists and is accessible
    try {
      const url = `${STORYGRAPH_BASE_URL}/to-read/${username}`;
      const result = await this.fetchWithFlareSolverr(url);

      if (!result) {
        return { valid: false, error: "Failed to access StoryGraph" };
      }

      // Check if the page indicates user not found
      // Look for specific error patterns
      if (
        result.includes("Page not found") ||
        result.includes("page you were looking for doesn't exist") ||
        result.includes("that page doesn't exist") ||
        result.includes("This user doesn't exist") ||
        result.includes("couldn't find that page")
      ) {
        return { valid: false, error: "User not found on StoryGraph" };
      }

      // Check if we got redirected to login page (list is private)
      if (
        result.includes("<title>Sign In | The StoryGraph</title>") ||
        result.includes("sign-in-btn")
      ) {
        return {
          valid: false,
          error: `This user's reading list is private. Set "Profile privacy level" to public at: https://app.thestorygraph.com/profile/edit/${username}`,
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error("[StoryGraph] Validation error:", error);
      return { valid: false, error: "Failed to validate StoryGraph username" };
    }
  }

  /**
   * Fetch books from StoryGraph to-read list
   * Note: StoryGraph uses infinite scroll, so we fetch all at once
   */
  async fetchBooks(
    config: Record<string, unknown>,
    page: number = 1,
  ): Promise<FetchResult> {
    const { username } = config as unknown as StoryGraphConfig;

    // StoryGraph doesn't have traditional pagination
    // The page loads with initial books, and more load via infinite scroll
    // For now, we'll just fetch what's on the initial page load
    if (page > 1) {
      return { books: [], hasMore: false };
    }

    try {
      const url = `${STORYGRAPH_BASE_URL}/to-read/${username}`;
      logger.debug(`[StoryGraph] Fetching: ${url}`);

      const html = await this.fetchWithFlareSolverr(url);

      if (!html) {
        return {
          books: [],
          hasMore: false,
          error: "Failed to fetch page",
        };
      }

      // Check if we got redirected to login page (list became private)
      if (
        html.includes("<title>Sign In | The StoryGraph</title>") ||
        html.includes("sign-in-btn")
      ) {
        return {
          books: [],
          hasMore: false,
          error: `LIST_PRIVATE:This user's reading list is now private. Set "Profile privacy level" to public at: https://app.thestorygraph.com/profile/edit/${username}`,
        };
      }

      // Parse the HTML to extract book titles and authors
      const books = this.parseBooks(html);

      logger.info(`[StoryGraph] Found ${books.length} books for ${username}`);

      // StoryGraph doesn't support pagination in a traditional way
      // We return hasMore: false since we can only get what loads initially
      return {
        books,
        hasMore: false,
      };
    } catch (error) {
      logger.error("[StoryGraph] Fetch error:", error);
      return {
        books: [],
        hasMore: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse books from StoryGraph HTML
   * The page structure has book cards with titles, authors, covers, pages, year, and series info
   */
  private parseBooks(html: string): ListBook[] {
    const books: ListBook[] = [];
    const seenIds = new Set<string>();

    // StoryGraph book cards are wrapped in:
    // <div class="book-pane" id="book_UUID" data-book-id="UUID">
    //   <img src="cdn.thestorygraph.com/...">
    //   <a href="/series/ID">Series Name</a> <a href="/series/ID">#N</a> (optional)
    //   <a href="/books/UUID">Title</a>
    //   <a href="/authors/UUID">Author</a>
    //   336 pages<span>•</span>hardcover<span>•</span>2019
    // </div>

    // Find all unique book UUIDs from data-book-id attributes
    const bookIdPattern = /data-book-id="([a-f0-9-]{36})"/gi;
    const bookIds = new Set<string>();
    let idMatch;
    while ((idMatch = bookIdPattern.exec(html)) !== null) {
      bookIds.add(idMatch[1]);
    }

    // For each book ID, extract the section and parse details
    for (const bookId of bookIds) {
      if (seenIds.has(bookId)) continue;
      seenIds.add(bookId);

      // Find the book-pane section for this book using id="book_UUID"
      // Match from id="book_UUID" to the next book-pane or end
      const bookSectionPattern = new RegExp(
        `id="book_${bookId}"[^>]*>[\\s\\S]*?(?=id="book_[a-f0-9-]{36}"|$)`,
        "i",
      );
      const sectionMatch = html.match(bookSectionPattern);
      if (!sectionMatch) continue;

      const section = sectionMatch[0];

      // Extract cover URL from img src (cdn.thestorygraph.com)
      const coverMatch = section.match(
        /<img[^>]*src="(https:\/\/cdn\.thestorygraph\.com\/[^"]+)"/i,
      );
      const coverUrl = coverMatch?.[1];

      // Extract title - from <a href="/books/UUID">Title</a> (text content, not image)
      const titleMatch = section.match(
        /<a[^>]*href="\/books\/[a-f0-9-]{36}"[^>]*>([^<]+)<\/a>/i,
      );
      if (!titleMatch) continue;
      const title = normalizeTitle(titleMatch[1].trim());
      if (!title) continue;

      // Extract author from <a href="/authors/...">Author</a>
      const authorMatch = section.match(
        /<a[^>]*href="\/authors\/[^"]*"[^>]*>([^<]+)<\/a>/i,
      );
      if (!authorMatch) continue;
      const author = normalizeAuthor(authorMatch[1].trim());
      if (!author) continue;

      // Extract page count: "336 pages"
      const pagesMatch = section.match(/(\d+)\s*pages/i);
      const pages = pagesMatch ? parseInt(pagesMatch[1], 10) : undefined;

      // Extract year: appears after </span> as "2019" before newline or SVG
      // Pattern: </span>YEAR followed by whitespace/newline/<
      const yearMatch = section.match(/<\/span>(\d{4})[\s\n<]/);
      const publishedYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      // Extract series info: <a href="/series/ID">Series Name</a> <a href="/series/ID">#N</a>
      let seriesName: string | undefined;
      let seriesPosition: number | undefined;
      const seriesMatch = section.match(
        /<a[^>]*href="\/series\/\d+"[^>]*>([^<#]+)<\/a>\s*<a[^>]*href="\/series\/\d+"[^>]*>#(\d+(?:\.\d+)?)<\/a>/i,
      );
      if (seriesMatch) {
        seriesName = seriesMatch[1].trim();
        seriesPosition = parseFloat(seriesMatch[2]);
      }

      books.push({
        title,
        author,
        hash: `storygraph:${bookId}`,
        sourceBookId: bookId,
        sourceUrl: `${STORYGRAPH_BASE_URL}/books/${bookId}`,
        coverUrl,
        pages,
        publishedYear,
        seriesName,
        seriesPosition,
      });
    }

    // Fallback: If no books found with data-book-id, try href pattern
    if (books.length === 0) {
      const hrefPattern = /href="\/books\/([a-f0-9-]{36})"/gi;
      const fallbackIds = new Set<string>();
      let hrefMatch;
      while ((hrefMatch = hrefPattern.exec(html)) !== null) {
        fallbackIds.add(hrefMatch[1]);
      }

      for (const bookId of fallbackIds) {
        if (seenIds.has(bookId)) continue;
        seenIds.add(bookId);

        // Try to find title and author near this book link
        const nearbyPattern = new RegExp(
          `href="/books/${bookId}"[^>]*>([^<]+)</a>[\\s\\S]*?href="/authors/[^"]*"[^>]*>([^<]+)</a>`,
          "i",
        );
        const nearbyMatch = html.match(nearbyPattern);
        if (!nearbyMatch) continue;

        const title = normalizeTitle(nearbyMatch[1].trim());
        const author = normalizeAuthor(nearbyMatch[2].trim());
        if (!title || !author) continue;

        // Try to get cover from alt text pattern
        const coverPattern = new RegExp(
          `href="/books/${bookId}"[^>]*>[\\s\\S]*?<img[^>]*src="(https://cdn\\.thestorygraph\\.com/[^"]+)"`,
          "i",
        );
        const coverMatch = html.match(coverPattern);

        books.push({
          title,
          author,
          hash: `storygraph:${bookId}`,
          sourceBookId: bookId,
          sourceUrl: `${STORYGRAPH_BASE_URL}/books/${bookId}`,
          coverUrl: coverMatch?.[1],
        });
      }
    }

    return books;
  }

  /**
   * Check if FlareSolverr is available
   */
  private async checkFlareSolverr(): Promise<boolean> {
    try {
      const response = await fetch(`${FLARESOLVERR_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      // Health endpoint might not exist, try v1 endpoint
      try {
        const response = await fetch(`${FLARESOLVERR_URL}/v1`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cmd: "sessions.list",
          }),
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  }

  /**
   * Fetch a page using FlareSolverr
   */
  private async fetchWithFlareSolverr(url: string): Promise<string | null> {
    const request: FlareSolverrRequest = {
      cmd: "request.get",
      url,
      maxTimeout: 60000,
    };

    try {
      const response = await fetch(`${FLARESOLVERR_URL}/v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        logger.error(
          `[StoryGraph] FlareSolverr HTTP ${response.status}: ${response.statusText}`,
        );
        return null;
      }

      const data = (await response.json()) as FlareSolverrResponse;

      if (data.status !== "ok" || !data.solution) {
        logger.error(`[StoryGraph] FlareSolverr error: ${data.message}`);
        return null;
      }

      return data.solution.response;
    } catch (error) {
      logger.error("[StoryGraph] FlareSolverr request failed:", error);
      return null;
    }
  }
}
