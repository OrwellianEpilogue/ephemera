import {
  type ListFetcher,
  type FetchResult,
  type AvailableList,
  type HardcoverConfig,
  normalizeTitle,
  normalizeAuthor,
} from "./types.js";
import { logger } from "../../utils/logger.js";

const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

// GraphQL response types
interface HardcoverContributor {
  author?: { name?: string };
  contribution?: string;
}

interface HardcoverLanguage {
  code2?: string;
  language?: string;
}

interface HardcoverEdition {
  language?: HardcoverLanguage | null;
}

interface HardcoverBook {
  id: number;
  title: string;
  cached_contributors: HardcoverContributor[] | null;
  default_ebook_edition?: HardcoverEdition | null;
  default_physical_edition?: HardcoverEdition | null;
}

interface HardcoverUserBook {
  id: number;
  date_added: string;
  book: HardcoverBook;
}

interface HardcoverListBook {
  id: number;
  created_at: string;
  book: HardcoverBook;
}

interface HardcoverList {
  id: number;
  name: string;
  slug: string;
}

interface HardcoverUser {
  id: number;
}

/**
 * Hardcover List Fetcher
 * Fetches books from Hardcover using their GraphQL API
 */
export class HardcoverFetcher implements ListFetcher {
  readonly source = "hardcover" as const;

  private apiToken: string | null = null;

  /**
   * Set the API token (from admin settings)
   */
  setApiToken(token: string | null): void {
    this.apiToken = token;
  }

  /**
   * Validate Hardcover configuration
   */
  async validateConfig(
    config: Record<string, unknown>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { username, listId } = config as unknown as HardcoverConfig;

    if (!username) {
      return { valid: false, error: "Username is required" };
    }

    if (!this.apiToken) {
      return {
        valid: false,
        error: "Hardcover API token not configured. Ask an admin to set it up.",
      };
    }

    // If listId is provided, validate it exists
    if (listId) {
      try {
        const lists = await this.getAvailableLists(config);
        const listExists = lists.some((l) => l.id === listId);
        if (!listExists) {
          return { valid: false, error: "Selected list not found" };
        }
      } catch {
        return { valid: false, error: "Failed to validate list" };
      }
    }

    return { valid: true };
  }

  /**
   * Fetch books from a Hardcover list
   */
  async fetchBooks(
    config: Record<string, unknown>,
    page: number = 1,
  ): Promise<FetchResult> {
    const { username, listId } = config as unknown as HardcoverConfig;

    if (!this.apiToken) {
      return {
        books: [],
        hasMore: false,
        error: "Hardcover API token not configured",
      };
    }

    try {
      // If no listId, fetch from user's "Want to Read" status
      if (!listId) {
        return await this.fetchWantToRead(username, page);
      }

      // Fetch from specific list
      return await this.fetchFromList(listId, page);
    } catch (error) {
      logger.error("[Hardcover] Fetch error:", error);
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
    const { username } = config as unknown as HardcoverConfig;

    if (!this.apiToken) {
      logger.warn("[Hardcover] Cannot get lists: API token not configured");
      return [];
    }

    try {
      // First, find the user ID by username
      const userId = await this.getUserIdByUsername(username);
      if (!userId) {
        logger.warn(`[Hardcover] User not found: ${username}`);
        return [];
      }

      // Query the user's lists
      const query = `
        query GetUserLists($userId: Int!) {
          lists(where: { user_id: { _eq: $userId } }, order_by: { name: asc }) {
            id
            name
            slug
          }
        }
      `;

      const result = await this.executeQuery(query, { userId });
      const hardcoverLists = result?.lists as HardcoverList[] | undefined;

      // Add default "Want to Read" option
      const lists: AvailableList[] = [
        { id: "__want_to_read__", name: "Want to Read", slug: "want-to-read" },
      ];

      if (hardcoverLists) {
        for (const list of hardcoverLists) {
          lists.push({
            id: String(list.id),
            name: list.name,
            slug: list.slug,
          });
        }
      }

      return lists;
    } catch (error) {
      logger.error("[Hardcover] Failed to get lists:", error);
      return [];
    }
  }

  /**
   * Fetch books from user's "Want to Read" status
   */
  private async fetchWantToRead(
    username: string,
    page: number,
  ): Promise<FetchResult> {
    const userId = await this.getUserIdByUsername(username);
    if (!userId) {
      return {
        books: [],
        hasMore: false,
        error: `User not found: ${username}`,
      };
    }

    const limit = 50;
    const offset = (page - 1) * limit;

    // status_id 1 = "Want to Read" in Hardcover
    // Use deterministic ordering: date_added desc, then by id to handle ties
    const query = `
      query GetWantToRead($userId: Int!, $limit: Int!, $offset: Int!) {
        user_books(
          where: { user_id: { _eq: $userId }, status_id: { _eq: 1 } }
          order_by: [{ date_added: desc }, { id: asc }]
          limit: $limit
          offset: $offset
        ) {
          id
          date_added
          book {
            id
            title
            cached_contributors
            default_ebook_edition {
              language { code2 }
            }
            default_physical_edition {
              language { code2 }
            }
          }
        }
      }
    `;

    const result = await this.executeQuery(query, { userId, limit, offset });
    const userBooks = result?.user_books as HardcoverUserBook[] | undefined;

    if (!userBooks) {
      return {
        books: [],
        hasMore: false,
        error: "Failed to fetch books",
      };
    }

    const books = userBooks.map((ub) => {
      const rawTitle = ub.book.title || "";
      const rawAuthor = this.extractAuthor(ub.book.cached_contributors);
      const title = normalizeTitle(rawTitle);
      const author = normalizeAuthor(rawAuthor);

      return {
        title,
        author,
        // Use Hardcover's book ID as stable identifier
        hash: `hardcover:${ub.book.id}`,
        addedAt: ub.date_added ? new Date(ub.date_added) : undefined,
        language:
          ub.book.default_ebook_edition?.language?.code2 ||
          ub.book.default_physical_edition?.language?.code2 ||
          undefined,
      };
    });

    const hasMore = userBooks.length >= limit;

    return {
      books,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
    };
  }

  /**
   * Fetch books from a specific list
   */
  private async fetchFromList(
    listId: string,
    page: number,
  ): Promise<FetchResult> {
    // Handle special "Want to Read" list ID
    if (listId === "__want_to_read__") {
      // This shouldn't happen as we handle it in fetchBooks,
      // but just in case, return empty
      return { books: [], hasMore: false, error: "Invalid list ID" };
    }

    const limit = 50;
    const offset = (page - 1) * limit;

    // Use deterministic ordering: created_at desc, then by id to handle ties
    const query = `
      query GetListBooks($listId: Int!, $limit: Int!, $offset: Int!) {
        list_books(
          where: { list_id: { _eq: $listId } }
          order_by: [{ created_at: desc }, { id: asc }]
          limit: $limit
          offset: $offset
        ) {
          id
          created_at
          book {
            id
            title
            cached_contributors
            default_ebook_edition {
              language { code2 }
            }
            default_physical_edition {
              language { code2 }
            }
          }
        }
      }
    `;

    const result = await this.executeQuery(query, {
      listId: parseInt(listId, 10),
      limit,
      offset,
    });
    const listBooks = result?.list_books as HardcoverListBook[] | undefined;

    if (!listBooks) {
      return {
        books: [],
        hasMore: false,
        error: "Failed to fetch books",
      };
    }

    const books = listBooks.map((lb) => {
      const rawTitle = lb.book.title || "";
      const rawAuthor = this.extractAuthor(lb.book.cached_contributors);
      const title = normalizeTitle(rawTitle);
      const author = normalizeAuthor(rawAuthor);

      return {
        title,
        author,
        // Use Hardcover's book ID as stable identifier
        hash: `hardcover:${lb.book.id}`,
        addedAt: lb.created_at ? new Date(lb.created_at) : undefined,
        language:
          lb.book.default_ebook_edition?.language?.code2 ||
          lb.book.default_physical_edition?.language?.code2 ||
          undefined,
      };
    });

    const hasMore = listBooks.length >= limit;

    return {
      books,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
    };
  }

  /**
   * Get user ID by username
   */
  private async getUserIdByUsername(username: string): Promise<number | null> {
    const query = `
      query GetUserByUsername($username: citext!) {
        users(where: { username: { _eq: $username } }, limit: 1) {
          id
        }
      }
    `;

    const result = await this.executeQuery(query, { username });
    const users = result?.users as HardcoverUser[] | undefined;

    if (users && users.length > 0) {
      return users[0].id;
    }

    return null;
  }

  /**
   * Extract author name from cached_contributors
   */
  private extractAuthor(
    contributors: Array<{
      author?: { name?: string };
      contribution?: string;
    }> | null,
  ): string {
    if (!contributors || contributors.length === 0) {
      return "Unknown Author";
    }

    // Find the first author (not translator, editor, etc.)
    const author = contributors.find(
      (c) => !c.contribution || c.contribution.toLowerCase() === "author",
    );

    if (author?.author?.name) {
      return author.author.name;
    }

    // Fall back to first contributor if no explicit author
    if (contributors[0]?.author?.name) {
      return contributors[0].author.name;
    }

    return "Unknown Author";
  }

  /**
   * Execute a GraphQL query
   */
  private async executeQuery(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    if (!this.apiToken) {
      throw new Error("API token not configured");
    }

    const response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error(`[Hardcover] API error: ${response.status} - ${text}`);
      throw new Error(`Hardcover API error: ${response.status}`);
    }

    const json = (await response.json()) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message: string }>;
    };

    if (json.errors) {
      logger.error("[Hardcover] GraphQL errors:", json.errors);
      throw new Error(json.errors[0]?.message || "GraphQL error");
    }

    return json.data || null;
  }
}
