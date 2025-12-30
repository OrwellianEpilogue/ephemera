import { createHash } from "crypto";

/**
 * List Sources
 */
export type ListSource =
  | "goodreads"
  | "storygraph"
  | "hardcover"
  | "openlibrary";

/**
 * A book from a reading list with enriched metadata
 */
export interface ListBook {
  // Core identification
  title: string;
  author: string;
  /** ISBN if available */
  isbn?: string;
  /** Language code (e.g., "en", "de", "fr") if available */
  language?: string;
  /** Unique hash for change detection (MD5 of normalized title + author) */
  hash: string;
  /** When the book was added to the list (if available) */
  addedAt?: Date;

  // Source identification (for platform linking)
  /** Platform-specific book ID (e.g., "43685219" for Goodreads) */
  sourceBookId?: string;
  /** Link to book on source platform */
  sourceUrl?: string;

  // Extended metadata
  /** Book description/synopsis */
  description?: string;
  /** Number of pages */
  pages?: number;
  /** Publication year */
  publishedYear?: number;
  /** User's rating on the source platform (0-5) */
  rating?: number;
  /** Community average rating on the source platform */
  averageRating?: number;

  // Series information
  /** Series name if book is part of a series */
  seriesName?: string;
  /** Position in series (supports decimals like 1.5 for novellas) */
  seriesPosition?: number;

  // Cover image
  /** URL to cover image on source platform */
  coverUrl?: string;

  // Genres/tags
  /** Genre/category tags from source platform */
  genres?: string[];
}

/**
 * Result from fetching a list
 */
export interface FetchResult {
  books: ListBook[];
  /** Whether there are more pages to fetch */
  hasMore: boolean;
  /** Next page number (if hasMore is true) */
  nextPage?: number;
  /** Error message if fetch failed */
  error?: string;
}

/**
 * Available shelf/list info
 */
export interface AvailableList {
  id: string;
  name: string;
  slug?: string;
}

/**
 * Source-specific configuration
 */
export interface GoodreadsConfig {
  userId: string;
  shelfName: string;
}

export interface StoryGraphConfig {
  username: string;
}

export interface HardcoverConfig {
  username: string;
  listId?: string;
  listSlug?: string;
}

export interface OpenLibraryConfig {
  username: string;
  listType: "reading-log" | "custom-list";
  shelf?: "want-to-read" | "currently-reading" | "already-read";
  listId?: string;
  listName?: string;
}

export type SourceConfig =
  | GoodreadsConfig
  | StoryGraphConfig
  | HardcoverConfig
  | OpenLibraryConfig;

/**
 * List Fetcher Interface
 * Each source implements this interface
 */
export interface ListFetcher {
  readonly source: ListSource;

  /**
   * Validate source configuration
   */
  validateConfig(
    config: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }>;

  /**
   * Extract user ID from a profile URL (if applicable)
   * Used for Goodreads where users paste their profile URL
   */
  parseProfileUrl?(url: string): Promise<{ userId: string } | null>;

  /**
   * Fetch books from the list (with pagination)
   * @param config Source-specific configuration
   * @param page Page number (1-indexed)
   */
  fetchBooks(
    config: Record<string, unknown>,
    page?: number,
  ): Promise<FetchResult>;

  /**
   * Get available shelves/lists for a user (if applicable)
   * Used for Goodreads custom shelves and Hardcover lists
   */
  getAvailableLists?(config: Record<string, unknown>): Promise<AvailableList[]>;
}

/**
 * Helper to create a hash for a book (for change detection)
 * Aggressively normalizes title and author to ensure consistent hashing
 * even when APIs return slightly different formatting
 */
export function createBookHash(title: string, author: string): string {
  const normalizeForHash = (str: string): string => {
    return (
      str
        // Unicode NFKC normalization (handles ligatures, compatibility chars)
        .normalize("NFKC")
        // Lowercase
        .toLowerCase()
        // Remove all punctuation and special chars (keep alphanumeric and spaces)
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        // Collapse multiple spaces to single space
        .replace(/\s+/g, " ")
        // Trim
        .trim()
    );
  };

  const normalized = `${normalizeForHash(title)}|${normalizeForHash(author)}`;
  return createHash("md5").update(normalized).digest("hex");
}

/**
 * Helper to normalize a book title
 * Removes series info, extra whitespace, etc.
 */
export function normalizeTitle(title: string): string {
  // Remove CDATA markers if present (from RSS)
  let normalized = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1");

  // Remove series info in parentheses at the end: "Title (Series #1)"
  normalized = normalized.replace(/\s*\([^)]+#\d+\)\s*$/i, "");

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Helper to normalize an author name
 */
export function normalizeAuthor(author: string): string {
  // Remove CDATA markers if present (from RSS)
  let normalized = author.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1");

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}
