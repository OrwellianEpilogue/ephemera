import {
  type ListFetcher,
  type FetchResult,
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
   * The page structure has book cards with titles and authors
   */
  private parseBooks(
    html: string,
  ): Array<{ title: string; author: string; hash: string }> {
    const books: Array<{ title: string; author: string; hash: string }> = [];

    // StoryGraph book cards have structure like:
    // <h3 class="font-bold text-xl">
    //   <span ...></span>
    //   <a href="/books/UUID">Title</a>
    //   <p class="font-body ...">
    //     <a href="/authors/UUID">Author Name</a>
    //   </p>
    // </h3>

    // Primary pattern: Look for book-pane-content sections containing book data
    // Match: <a href="/books/UUID">Title</a> followed by <a href="/authors/...">Author</a>
    const bookPattern =
      /<a[^>]*href="\/books\/([a-f0-9-]{36})"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*href="\/authors\/[^"]*"[^>]*>([^<]+)<\/a>/gi;

    let match;
    const seenIds = new Set<string>();

    while ((match = bookPattern.exec(html)) !== null) {
      const bookId = match[1];

      // Skip duplicates (StoryGraph shows books multiple times for mobile/desktop)
      if (seenIds.has(bookId)) {
        continue;
      }
      seenIds.add(bookId);

      const title = normalizeTitle(match[2].trim());
      const author = normalizeAuthor(match[3].trim());

      if (title && author) {
        books.push({
          title,
          author,
          // Use StoryGraph's book UUID as stable identifier
          hash: `storygraph:${bookId}`,
        });
      }
    }

    // Fallback: Try alt text from cover images (format: "Title by Author")
    if (books.length === 0) {
      const altPattern =
        /<a[^>]*href="\/books\/([a-f0-9-]{36})"[^>]*>[\s\S]*?<img[^>]*alt="([^"]+) by ([^"]+)"[^>]*>/gi;

      while ((match = altPattern.exec(html)) !== null) {
        const bookId = match[1];
        if (seenIds.has(bookId)) continue;
        seenIds.add(bookId);

        const title = normalizeTitle(match[2].trim());
        const author = normalizeAuthor(match[3].trim());

        if (title && author) {
          books.push({
            title,
            author,
            hash: `storygraph:${bookId}`,
          });
        }
      }
    }

    // Deduplicate by hash
    const seen = new Set<string>();
    return books.filter((book) => {
      if (seen.has(book.hash)) {
        return false;
      }
      seen.add(book.hash);
      return true;
    });
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
