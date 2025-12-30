import {
  type ListFetcher,
  type FetchResult,
  type ListBook,
  type AvailableList,
  type OpenLibraryConfig,
  normalizeTitle,
  normalizeAuthor,
} from "./types.js";
import { logger } from "../../utils/logger.js";

const OPENLIBRARY_BASE_URL = "https://openlibrary.org";
const COVERS_BASE_URL = "https://covers.openlibrary.org";

// User-Agent header (required by OpenLibrary API)
const USER_AGENT = "Mozilla/5.0 (compatible; BookImporter/1.0)";

// API response types
interface OpenLibraryWork {
  title: string;
  key: string; // e.g., "/works/OL45804W"
  author_keys?: string[];
  author_names?: string[];
  first_publish_year?: number;
  cover_id?: number;
  cover_edition_key?: string;
  edition_key?: string[];
}

interface OpenLibraryReadingLogEntry {
  work: OpenLibraryWork;
  logged_edition?: string;
  logged_date: string;
}

interface OpenLibraryReadingLogResponse {
  page: number;
  numFound: number;
  reading_log_entries: OpenLibraryReadingLogEntry[];
}

interface OpenLibraryListEntry {
  url: string; // e.g., "/people/george08/lists/OL97L"
  name: string;
  seed_count: number;
  edition_count: number;
}

interface OpenLibraryListsResponse {
  entries?: OpenLibraryListEntry[];
}

interface OpenLibrarySeedEntry {
  url: string; // e.g., "/works/OL45804W" or "/books/OL123M"
  title?: string;
  type?: { key: string };
  picture?: { url: string };
}

interface OpenLibrarySeedsResponse {
  entries?: OpenLibrarySeedEntry[];
}

interface OpenLibraryWorkDetails {
  title?: string;
  description?: string | { value: string };
  subjects?: string[];
  authors?: Array<{ author: { key: string } }>;
  covers?: number[];
}

interface OpenLibraryAuthorDetails {
  name?: string;
}

interface OpenLibraryEdition {
  isbn_10?: string[];
  isbn_13?: string[];
  series?: string[];
  number_of_pages?: number;
  languages?: Array<{ key: string }>;
  full_title?: string;
  publish_date?: string;
  covers?: number[];
}

/**
 * OpenLibrary List Fetcher
 * Fetches books from OpenLibrary reading lists and custom lists
 */
export class OpenLibraryFetcher implements ListFetcher {
  readonly source = "openlibrary" as const;

  /**
   * Validate OpenLibrary configuration
   */
  async validateConfig(
    config: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { username, listType, shelf, listId } =
      config as unknown as OpenLibraryConfig;

    if (!username) {
      return { valid: false, error: "Username is required" };
    }

    // Basic username validation
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return { valid: false, error: "Invalid username format" };
    }

    if (!listType) {
      return { valid: false, error: "List type is required" };
    }

    if (listType === "reading-log") {
      if (!shelf) {
        return { valid: false, error: "Shelf is required for reading log" };
      }
      if (
        !["want-to-read", "currently-reading", "already-read"].includes(shelf)
      ) {
        return { valid: false, error: "Invalid shelf name" };
      }

      // Verify user exists and shelf is accessible
      try {
        const url = `${OPENLIBRARY_BASE_URL}/people/${username}/books/${shelf}.json?limit=1`;
        const response = await this.fetchWithUserAgent(url);

        if (!response.ok) {
          if (response.status === 404) {
            return { valid: false, error: "User not found on OpenLibrary" };
          }
          return {
            valid: false,
            error: `Failed to access reading list (${response.status})`,
          };
        }

        const data = (await response.json()) as OpenLibraryReadingLogResponse;
        if (data.numFound === undefined) {
          return { valid: false, error: "Invalid response from OpenLibrary" };
        }
      } catch (error) {
        logger.error("[OpenLibrary] Validation error:", error);
        return {
          valid: false,
          error: "Failed to validate OpenLibrary username",
        };
      }
    } else if (listType === "custom-list") {
      if (!listId) {
        return { valid: false, error: "List ID is required for custom lists" };
      }

      // Verify list exists
      try {
        const url = `${OPENLIBRARY_BASE_URL}/people/${username}/lists/${listId}/seeds.json?limit=1`;
        const response = await this.fetchWithUserAgent(url);

        if (!response.ok) {
          if (response.status === 404) {
            return { valid: false, error: "List not found" };
          }
          return {
            valid: false,
            error: `Failed to access list (${response.status})`,
          };
        }
      } catch (error) {
        logger.error("[OpenLibrary] List validation error:", error);
        return { valid: false, error: "Failed to validate list" };
      }
    } else {
      return { valid: false, error: "Invalid list type" };
    }

    return { valid: true };
  }

  /**
   * Parse OpenLibrary profile URL to extract username
   */
  async parseProfileUrl(url: string): Promise<{ userId: string } | null> {
    // Patterns:
    // https://openlibrary.org/people/{username}
    // https://openlibrary.org/people/{username}/books/want-to-read
    const match = url.match(/openlibrary\.org\/people\/([a-zA-Z0-9_.-]+)/i);
    if (match) {
      return { userId: match[1] };
    }
    return null;
  }

  /**
   * Fetch books from OpenLibrary list
   */
  async fetchBooks(
    config: Record<string, unknown>,
    page: number = 1,
  ): Promise<FetchResult> {
    const { username, listType, shelf, listId } =
      config as unknown as OpenLibraryConfig;

    try {
      if (listType === "reading-log" && shelf) {
        return await this.fetchReadingLog(username, shelf, page);
      } else if (listType === "custom-list" && listId) {
        return await this.fetchCustomList(username, listId, page);
      }

      return {
        books: [],
        hasMore: false,
        error: "Invalid configuration",
      };
    } catch (error) {
      logger.error("[OpenLibrary] Fetch error:", error);
      return {
        books: [],
        hasMore: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get available lists for a user
   */
  async getAvailableLists(
    config: Record<string, unknown>,
  ): Promise<AvailableList[]> {
    const { username } = config as unknown as OpenLibraryConfig;

    // Built-in reading log shelves
    const lists: AvailableList[] = [
      {
        id: "reading-log:want-to-read",
        name: "Want to Read",
        slug: "want-to-read",
      },
      {
        id: "reading-log:currently-reading",
        name: "Currently Reading",
        slug: "currently-reading",
      },
      {
        id: "reading-log:already-read",
        name: "Already Read",
        slug: "already-read",
      },
    ];

    // Fetch custom lists
    try {
      const url = `${OPENLIBRARY_BASE_URL}/people/${username}/lists.json`;
      const response = await this.fetchWithUserAgent(url);

      if (response.ok) {
        const data = (await response.json()) as OpenLibraryListsResponse;

        if (data.entries) {
          for (const entry of data.entries) {
            // Extract list ID from URL (e.g., "/people/username/lists/OL97L" -> "OL97L")
            const listIdMatch = entry.url.match(/\/lists\/([^/]+)$/);
            if (listIdMatch) {
              lists.push({
                id: `custom:${listIdMatch[1]}`,
                name: entry.name,
                slug: listIdMatch[1],
              });
            }
          }
        }
      }
    } catch (error) {
      logger.warn("[OpenLibrary] Failed to fetch custom lists:", error);
      // Continue with just the built-in shelves
    }

    return lists;
  }

  /**
   * Fetch books from reading log (want-to-read, currently-reading, already-read)
   */
  private async fetchReadingLog(
    username: string,
    shelf: string,
    page: number,
  ): Promise<FetchResult> {
    const pageSize = 50;
    const url = `${OPENLIBRARY_BASE_URL}/people/${username}/books/${shelf}.json?page=${page}&limit=${pageSize}`;

    logger.debug(`[OpenLibrary] Fetching reading log: ${url}`);

    const response = await this.fetchWithUserAgent(url);

    if (!response.ok) {
      if (response.status === 404) {
        return { books: [], hasMore: false, error: "User or shelf not found" };
      }
      return { books: [], hasMore: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as OpenLibraryReadingLogResponse;

    if (!data.reading_log_entries) {
      return { books: [], hasMore: false };
    }

    const books: ListBook[] = [];

    for (const entry of data.reading_log_entries) {
      const work = entry.work;
      if (!work.title) continue;

      const title = normalizeTitle(work.title);
      const author = normalizeAuthor(
        work.author_names?.join(", ") || "Unknown Author",
      );

      // Extract work key (e.g., "OL45804W" from "/works/OL45804W")
      const workKey = work.key?.replace("/works/", "") || "";

      // Start with basic book data
      // Link to the specific edition if logged, otherwise fall back to work
      const sourceUrl = entry.logged_edition
        ? `${OPENLIBRARY_BASE_URL}${entry.logged_edition}`
        : work.key
          ? `${OPENLIBRARY_BASE_URL}${work.key}`
          : undefined;

      const book: ListBook = {
        title,
        author,
        hash: `openlibrary:${workKey}`,
        sourceBookId: work.key,
        sourceUrl,
        coverUrl: work.cover_id
          ? `${COVERS_BASE_URL}/b/id/${work.cover_id}-L.jpg`
          : undefined,
        publishedYear: work.first_publish_year,
        addedAt: entry.logged_date ? new Date(entry.logged_date) : undefined,
      };

      // Fetch edition data for ISBN and series if logged_edition is available
      if (entry.logged_edition) {
        const edition = await this.fetchEditionDetails(entry.logged_edition);
        if (edition) {
          // Get ISBN (prefer ISBN-13)
          if (edition.isbn_13?.[0]) {
            book.isbn = edition.isbn_13[0];
          } else if (edition.isbn_10?.[0]) {
            book.isbn = edition.isbn_10[0];
          }

          // Get page count
          if (edition.number_of_pages) {
            book.pages = edition.number_of_pages;
          }

          // Get language
          if (edition.languages?.[0]?.key) {
            // Extract language code from "/languages/eng" -> "eng"
            const langCode = edition.languages[0].key.replace(
              "/languages/",
              "",
            );
            book.language = langCode;
          }

          // Get publish year from edition (more accurate than work's first_publish_year)
          if (edition.publish_date) {
            const editionYear = this.extractYear(edition.publish_date);
            if (editionYear) {
              book.publishedYear = editionYear;
            }
          }

          // Use edition's cover instead of work's cover
          if (edition.covers?.[0]) {
            book.coverUrl = `${COVERS_BASE_URL}/b/id/${edition.covers[0]}-L.jpg`;
          }

          // Parse series info
          if (edition.series?.[0]) {
            const seriesInfo = this.parseSeriesString(edition.series[0]);
            if (seriesInfo) {
              book.seriesName = seriesInfo.name;
              book.seriesPosition = seriesInfo.position;

              // If series field doesn't have position, try extracting from full_title
              if (seriesInfo.position === undefined && edition.full_title) {
                const positionFromTitle = this.extractSeriesPositionFromTitle(
                  edition.full_title,
                  seriesInfo.name,
                );
                if (positionFromTitle !== undefined) {
                  book.seriesPosition = positionFromTitle;
                }
              }
            }
          }
        }
      }

      // Fetch work details for description and genres
      if (work.key) {
        const workDetails = await this.fetchWorkDetails(work.key);
        if (workDetails) {
          if (workDetails.description) {
            book.description = this.extractDescription(workDetails.description);
          }
          if (workDetails.subjects?.length) {
            book.genres = workDetails.subjects.slice(0, 5);
          }
        }
      }

      books.push(book);
    }

    const totalPages = Math.ceil(data.numFound / pageSize);
    const hasMore = page < totalPages;

    logger.info(
      `[OpenLibrary] Fetched ${books.length} books (page ${page}/${totalPages}) for ${username}/${shelf}`,
    );

    return {
      books,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
    };
  }

  /**
   * Fetch books from a custom list
   */
  private async fetchCustomList(
    username: string,
    listId: string,
    page: number,
  ): Promise<FetchResult> {
    // OpenLibrary custom lists use offset-based pagination
    const pageSize = 50;
    const offset = (page - 1) * pageSize;
    const url = `${OPENLIBRARY_BASE_URL}/people/${username}/lists/${listId}/seeds.json?limit=${pageSize}&offset=${offset}`;

    logger.debug(`[OpenLibrary] Fetching custom list: ${url}`);

    const response = await this.fetchWithUserAgent(url);

    if (!response.ok) {
      if (response.status === 404) {
        return { books: [], hasMore: false, error: "List not found" };
      }
      return { books: [], hasMore: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as OpenLibrarySeedsResponse;

    if (!data.entries || data.entries.length === 0) {
      return { books: [], hasMore: false };
    }

    const books: ListBook[] = [];

    // Seeds can be works, editions, or subjects - we only want works and editions
    for (const entry of data.entries) {
      // Filter to works and books (editions)
      if (
        !entry.url.startsWith("/works/") &&
        !entry.url.startsWith("/books/")
      ) {
        continue;
      }

      // For seeds, we may need to fetch additional details
      const book = await this.enrichSeedEntry(entry);
      if (book) {
        books.push(book);
      }
    }

    // Check if there are more entries
    const hasMore = data.entries.length === pageSize;

    logger.info(
      `[OpenLibrary] Fetched ${books.length} books from custom list ${listId} (page ${page})`,
    );

    return {
      books,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
    };
  }

  /**
   * Enrich a seed entry with full book details
   */
  private async enrichSeedEntry(
    entry: OpenLibrarySeedEntry,
  ): Promise<ListBook | null> {
    try {
      // If it's a work, fetch work details
      if (entry.url.startsWith("/works/")) {
        const workKey = entry.url.replace("/works/", "");
        const workDetails = await this.fetchWorkDetails(entry.url);

        if (!workDetails?.title) {
          return null;
        }

        const authorName = await this.getAuthorFromWork(workDetails);

        return {
          title: normalizeTitle(workDetails.title),
          author: normalizeAuthor(authorName || "Unknown Author"),
          hash: `openlibrary:${workKey}`,
          sourceBookId: entry.url,
          sourceUrl: `${OPENLIBRARY_BASE_URL}${entry.url}`,
          coverUrl: workDetails.covers?.[0]
            ? `${COVERS_BASE_URL}/b/id/${workDetails.covers[0]}-L.jpg`
            : undefined,
          description: this.extractDescription(workDetails.description),
          genres: workDetails.subjects?.slice(0, 5),
        };
      }

      // If it's an edition/book, use entry title or fetch details
      if (entry.url.startsWith("/books/")) {
        const editionKey = entry.url.replace("/books/", "");

        // Editions have limited direct info in seeds, use title if available
        if (entry.title) {
          return {
            title: normalizeTitle(entry.title),
            author: "Unknown Author", // Would need additional API call
            hash: `openlibrary:${editionKey}`,
            sourceBookId: entry.url,
            sourceUrl: `${OPENLIBRARY_BASE_URL}${entry.url}`,
            coverUrl: entry.picture?.url,
          };
        }

        // Need to fetch edition details
        const editionResponse = await this.fetchWithUserAgent(
          `${OPENLIBRARY_BASE_URL}${entry.url}.json`,
        );

        if (editionResponse.ok) {
          const editionData = await editionResponse.json();
          const title = editionData.title || editionData.full_title;
          if (title) {
            return {
              title: normalizeTitle(title),
              author: normalizeAuthor(
                Array.isArray(editionData.authors)
                  ? editionData.authors
                      .map((a: { name?: string }) => a.name)
                      .join(", ")
                  : "Unknown Author",
              ),
              hash: `openlibrary:${editionKey}`,
              sourceBookId: entry.url,
              sourceUrl: `${OPENLIBRARY_BASE_URL}${entry.url}`,
              coverUrl: editionData.covers?.[0]
                ? `${COVERS_BASE_URL}/b/id/${editionData.covers[0]}-L.jpg`
                : undefined,
              pages: editionData.number_of_pages,
              publishedYear: editionData.publish_date
                ? this.extractYear(editionData.publish_date)
                : undefined,
            };
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn(
        `[OpenLibrary] Failed to enrich seed entry ${entry.url}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Fetch work details from OpenLibrary
   */
  private async fetchWorkDetails(
    workPath: string,
  ): Promise<OpenLibraryWorkDetails | null> {
    try {
      const response = await this.fetchWithUserAgent(
        `${OPENLIBRARY_BASE_URL}${workPath}.json`,
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as OpenLibraryWorkDetails;
    } catch {
      return null;
    }
  }

  /**
   * Get author name from work details
   */
  private async getAuthorFromWork(
    work: OpenLibraryWorkDetails,
  ): Promise<string | null> {
    if (!work.authors || work.authors.length === 0) {
      return null;
    }

    const authorNames: string[] = [];

    for (const authorRef of work.authors.slice(0, 3)) {
      try {
        const authorKey = authorRef.author?.key;
        if (!authorKey) continue;

        const response = await this.fetchWithUserAgent(
          `${OPENLIBRARY_BASE_URL}${authorKey}.json`,
        );

        if (response.ok) {
          const authorData =
            (await response.json()) as OpenLibraryAuthorDetails;
          if (authorData.name) {
            authorNames.push(authorData.name);
          }
        }
      } catch {
        // Continue with next author
      }
    }

    return authorNames.length > 0 ? authorNames.join(", ") : null;
  }

  /**
   * Extract description from OpenLibrary format
   */
  private extractDescription(
    desc: string | { value: string } | undefined,
  ): string | undefined {
    if (!desc) return undefined;
    if (typeof desc === "string") return desc;
    return desc.value;
  }

  /**
   * Extract year from publish date string
   */
  private extractYear(publishDate: string): number | undefined {
    const match = publishDate.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : undefined;
  }

  /**
   * Fetch with User-Agent header
   */
  private async fetchWithUserAgent(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });
  }

  /**
   * Fetch edition details for ISBN and series
   */
  private async fetchEditionDetails(
    editionPath: string,
  ): Promise<OpenLibraryEdition | null> {
    try {
      const response = await this.fetchWithUserAgent(
        `${OPENLIBRARY_BASE_URL}${editionPath}.json`,
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as OpenLibraryEdition;
    } catch {
      return null;
    }
  }

  /**
   * Parse series string
   */
  private parseSeriesString(
    seriesStr: string,
  ): { name: string; position?: number } | null {
    if (!seriesStr) return null;

    const patterns = [
      /^(.+?)\s*#(\d+(?:\.\d+)?)\s*$/, // "Series #1" or "Series #1.5"
      /^(.+?),?\s*#(\d+(?:\.\d+)?)\s*$/, // "Series, #1"
      /^(.+?)\s*\(Book\s*(\d+(?:\.\d+)?)\)\s*$/i, // "Series (Book 1)"
      /^(.+?)\s+(\d+(?:\.\d+)?)\s*$/, // "Series 1"
    ];

    for (const pattern of patterns) {
      const match = seriesStr.match(pattern);
      if (match) {
        return {
          name: match[1].trim(),
          position: parseFloat(match[2]),
        };
      }
    }

    // If no position found, return just the name
    return { name: seriesStr.trim() };
  }

  /**
   * Extract series position from full_title when series field doesn't have it
   */
  private extractSeriesPositionFromTitle(
    fullTitle: string,
    seriesName: string,
  ): number | undefined {
    if (!fullTitle || !seriesName) return undefined;

    // Look for patterns like "(SeriesName, Book N)" or "(SeriesName #N)" in the title
    // Use case-insensitive matching and escape regex special chars in series name
    const escapedSeriesName = seriesName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(
        `\\(${escapedSeriesName},?\\s*Book\\s*(\\d+(?:\\.\\d+)?)\\)`,
        "i",
      ),
      new RegExp(`\\(${escapedSeriesName}\\s*#(\\d+(?:\\.\\d+)?)\\)`, "i"),
      new RegExp(`\\(${escapedSeriesName},\\s*#(\\d+(?:\\.\\d+)?)\\)`, "i"),
      new RegExp(`${escapedSeriesName},?\\s*Book\\s*(\\d+(?:\\.\\d+)?)`, "i"),
    ];

    for (const pattern of patterns) {
      const match = fullTitle.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return undefined;
  }
}
