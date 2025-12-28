import { XMLParser } from "fast-xml-parser";
import {
  type ListFetcher,
  type FetchResult,
  type AvailableList,
  type GoodreadsConfig,
  createBookHash,
  normalizeTitle,
  normalizeAuthor,
} from "./types.js";
import { logger } from "../../utils/logger.js";

const GOODREADS_RSS_BASE = "https://www.goodreads.com/review/list_rss";
const GOODREADS_LIST_BASE = "https://www.goodreads.com/review/list";
const BOOKS_PER_PAGE = 100;

/**
 * Decode HTML entities in a string
 */
function decodeHtmlEntities(str: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&lrm;": "", // Left-to-right mark - remove it
    "&rlm;": "", // Right-to-left mark - remove it
    "&zwnj;": "", // Zero-width non-joiner - remove it
    "&zwj;": "", // Zero-width joiner - remove it
  };

  return str.replace(/&[a-z0-9#]+;/gi, (match) => {
    const lowerMatch = match.toLowerCase();
    // Check named entities (case-insensitive)
    if (entities[lowerMatch] !== undefined) {
      return entities[lowerMatch];
    }
    // Handle numeric entities like &#123; or &#x1F4A9;
    if (lowerMatch.startsWith("&#")) {
      const num = lowerMatch.startsWith("&#x")
        ? parseInt(lowerMatch.slice(3, -1), 16)
        : parseInt(lowerMatch.slice(2, -1), 10);
      if (!isNaN(num)) {
        return String.fromCharCode(num);
      }
    }
    return ""; // Remove unrecognized entities instead of keeping them
  });
}

/**
 * Goodreads List Fetcher
 * Fetches books from Goodreads RSS feeds
 */
export class GoodreadsFetcher implements ListFetcher {
  readonly source = "goodreads" as const;

  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      cdataPropName: "__cdata",
    });
  }

  /**
   * Validate Goodreads configuration
   */
  async validateConfig(
    config: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { userId, shelfName } = config as unknown as GoodreadsConfig;

    if (!userId) {
      return { valid: false, error: "User ID is required" };
    }

    if (!/^\d+$/.test(userId)) {
      return { valid: false, error: "User ID must be numeric" };
    }

    if (!shelfName) {
      return { valid: false, error: "Shelf name is required" };
    }

    // Try to fetch the first page to validate
    try {
      const url = this.buildRssUrl(userId, shelfName, 1);
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            valid: false,
            error: "Shelf not found or user profile is private",
          };
        }
        return {
          valid: false,
          error: `Failed to access shelf: ${response.status}`,
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error("[Goodreads] Validation error:", error);
      return { valid: false, error: "Failed to connect to Goodreads" };
    }
  }

  /**
   * Parse a Goodreads profile URL to extract the user ID
   * Examples:
   *   https://www.goodreads.com/user/show/94947565-milena-sgroi
   *   https://www.goodreads.com/user/show/94947565
   */
  async parseProfileUrl(url: string): Promise<{ userId: string } | null> {
    // Match patterns like /user/show/12345 or /user/show/12345-name
    const match = url.match(/\/user\/show\/(\d+)(?:-[^/]*)?/);

    if (match) {
      return { userId: match[1] };
    }

    // Also try to match list URLs: /review/list/12345
    const listMatch = url.match(/\/review\/list\/(\d+)/);
    if (listMatch) {
      return { userId: listMatch[1] };
    }

    return null;
  }

  /**
   * Fetch books from a Goodreads shelf
   */
  async fetchBooks(
    config: Record<string, unknown>,
    page: number = 1,
  ): Promise<FetchResult> {
    const { userId, shelfName } = config as unknown as GoodreadsConfig;

    try {
      const url = this.buildRssUrl(userId, shelfName, page);
      logger.debug(`[Goodreads] Fetching: ${url}`);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BookDownloader/1.0)",
        },
      });

      if (!response.ok) {
        return {
          books: [],
          hasMore: false,
          error: `Failed to fetch: ${response.status} ${response.statusText}`,
        };
      }

      const xml = await response.text();
      const result = this.parser.parse(xml);

      // Navigate to the items in the RSS feed
      const channel = result?.rss?.channel;
      if (!channel) {
        return {
          books: [],
          hasMore: false,
          error: "Invalid RSS feed structure",
        };
      }

      // Handle both single item and array of items
      let items = channel.item;
      if (!items) {
        // No items on this page - we've reached the end
        return {
          books: [],
          hasMore: false,
        };
      }

      if (!Array.isArray(items)) {
        items = [items];
      }

      const books = items.map((item: Record<string, unknown>) => {
        const rawTitle = this.extractText(item.title);
        const rawAuthor = this.extractText(item.author_name);
        const title = normalizeTitle(rawTitle);
        const author = normalizeAuthor(rawAuthor);

        // Extract book ID from book_id field or guid URL
        // guid is typically: https://www.goodreads.com/review/show/12345
        // book_id is the direct ID
        let bookId = this.extractText(item.book_id);
        if (!bookId) {
          const guid = this.extractText(item.guid);
          const match = guid.match(/\/(\d+)(?:\?|$)/);
          if (match) bookId = match[1];
        }

        return {
          title,
          author,
          isbn: this.extractText(item.isbn) || undefined,
          // Use Goodreads book ID if available, otherwise fall back to hash
          hash: bookId ? `goodreads:${bookId}` : createBookHash(title, author),
          addedAt: item.user_date_added
            ? new Date(this.extractText(item.user_date_added))
            : undefined,
        };
      });

      // Goodreads returns up to 100 items per page
      // If we got exactly 100, there might be more
      const hasMore = items.length >= BOOKS_PER_PAGE;

      return {
        books,
        hasMore,
        nextPage: hasMore ? page + 1 : undefined,
      };
    } catch (error) {
      logger.error("[Goodreads] Fetch error:", error);
      return {
        books: [],
        hasMore: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get available shelves for a user
   * Parses the HTML of the user's book list page
   */
  async getAvailableLists(
    config: Record<string, unknown>,
  ): Promise<AvailableList[]> {
    const { userId } = config as unknown as GoodreadsConfig;

    // Default shelves that always exist
    const defaultShelves: AvailableList[] = [
      { id: "to-read", name: "Want to Read" },
      { id: "currently-reading", name: "Currently Reading" },
      { id: "read", name: "Read" },
    ];

    try {
      // Fetch the user's book list page to find custom shelves
      const url = `${GOODREADS_LIST_BASE}/${userId}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BookDownloader/1.0)",
        },
      });

      if (!response.ok) {
        logger.warn(`[Goodreads] Failed to fetch shelves: ${response.status}`);
        return defaultShelves;
      }

      const html = await response.text();

      // Parse custom shelves from the page
      // They appear in a div with links like /review/list/12345?shelf=custom-shelf-name
      const shelfRegex = /href="[^"]*\?shelf=([^"&]+)"[^>]*>([^<]+)</g;
      const customShelves: AvailableList[] = [];
      const seenIds = new Set(defaultShelves.map((s) => s.id));

      let match;
      while ((match = shelfRegex.exec(html)) !== null) {
        const id = decodeURIComponent(match[1]);
        // Decode HTML entities and remove trailing book count like "(1)" or "(123)"
        const rawName = decodeHtmlEntities(match[2].trim());
        const name = rawName.replace(/\s*\(\d+\)\s*$/, "").trim();

        // Skip if we've already seen this shelf, it's a system shelf, or name is empty
        if (seenIds.has(id) || id === "all" || !name) {
          continue;
        }

        seenIds.add(id);
        customShelves.push({ id, name });
      }

      return [...defaultShelves, ...customShelves];
    } catch (error) {
      logger.error("[Goodreads] Failed to get shelves:", error);
      return defaultShelves;
    }
  }

  /**
   * Build the RSS URL for a shelf
   */
  private buildRssUrl(userId: string, shelfName: string, page: number): string {
    return `${GOODREADS_RSS_BASE}/${userId}?shelf=${encodeURIComponent(shelfName)}&page=${page}`;
  }

  /**
   * Extract text from various XML node formats
   */
  private extractText(node: unknown): string {
    if (typeof node === "string") {
      return node;
    }
    if (typeof node === "number") {
      return String(node);
    }
    if (node && typeof node === "object") {
      // Handle CDATA
      if ("__cdata" in node) {
        return (node as { __cdata: string }).__cdata;
      }
      // Handle text node
      if ("#text" in node) {
        return (node as { "#text": string })["#text"];
      }
    }
    return "";
  }
}
