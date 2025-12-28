import { eq, and, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  importLists,
  downloadRequests,
  type ImportList,
  type NewImportList,
} from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { permissionsService } from "./permissions.js";
import { requestCheckerService } from "./request-checker.js";
import {
  getFetcher,
  type ListSource,
  type ListBook,
} from "./list-fetchers/index.js";

/**
 * Input for creating a new list
 */
export interface CreateListInput {
  source: ListSource;
  name: string;
  sourceConfig: Record<string, unknown>;
  searchDefaults?: {
    lang?: string[];
    ext?: string[];
    content?: string[];
    sort?: string;
  };
  importMode?: "all" | "future";
  useBookLanguage?: boolean;
}

/**
 * Input for updating a list
 */
export interface UpdateListInput {
  name?: string;
  sourceConfig?: Record<string, unknown>;
  searchDefaults?: {
    lang?: string[];
    ext?: string[];
    content?: string[];
    sort?: string;
  };
  enabled?: boolean;
  useBookLanguage?: boolean;
}

/**
 * Result from fetching and processing a list
 */
export interface ProcessListResult {
  newBooks: number;
  totalBooks: number;
  error?: string;
}

/**
 * List Import Service
 * Manages import lists and processes book imports
 */
class ListImportService {
  // Track lists currently being fetched to prevent concurrent fetches
  private fetchingLists = new Set<number>();

  // ========== CRUD Operations ==========

  /**
   * Create a new import list
   */
  async createList(userId: string, data: CreateListInput): Promise<ImportList> {
    // Validate source configuration
    const fetcher = getFetcher(data.source);
    const validation = await fetcher.validateConfig(data.sourceConfig);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid configuration");
    }

    // Check user permissions for import mode
    if (data.importMode === "all") {
      const canStartDownloads = await permissionsService.canPerform(
        userId,
        "canStartDownloads",
      );
      if (!canStartDownloads) {
        throw new Error(
          "You don't have permission to import all books. Only 'future' mode is available.",
        );
      }
    }

    const newList: NewImportList = {
      userId,
      source: data.source,
      name: data.name,
      sourceConfig: data.sourceConfig as ImportList["sourceConfig"],
      searchDefaults: data.searchDefaults || null,
      importMode: data.importMode || "future",
      useBookLanguage: data.useBookLanguage ?? true,
      enabled: true,
      totalBooksImported: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert(importLists).values(newList).returning();

    logger.info(
      `[ListImport] Created list "${data.name}" for user ${userId} (source: ${data.source})`,
    );

    // Trigger initial fetch for both modes:
    // - "all" mode: imports all existing books
    // - "future" mode: just snapshots current books without importing
    // Don't block the response, process in background
    this.fetchAndProcessList(result[0].id).catch((error) => {
      logger.error(
        `[ListImport] Failed initial fetch for list ${result[0].id}:`,
        error,
      );
    });

    return result[0];
  }

  /**
   * Update an existing list
   */
  async updateList(
    listId: number,
    userId: string,
    isAdmin: boolean,
    data: UpdateListInput,
  ): Promise<ImportList> {
    // Verify ownership
    const list = await this.getListById(listId);
    if (!list) {
      throw new Error("List not found");
    }
    if (!isAdmin && list.userId !== userId) {
      throw new Error("Not authorized to update this list");
    }

    // If sourceConfig is being updated, validate it
    if (data.sourceConfig) {
      const fetcher = getFetcher(list.source as ListSource);
      const validation = await fetcher.validateConfig(data.sourceConfig);
      if (!validation.valid) {
        throw new Error(validation.error || "Invalid configuration");
      }
    }

    const updateData: Partial<ImportList> = {
      ...data,
      sourceConfig: data.sourceConfig as ImportList["sourceConfig"],
      searchDefaults: data.searchDefaults || undefined,
      updatedAt: new Date(),
    };

    const result = await db
      .update(importLists)
      .set(updateData)
      .where(eq(importLists.id, listId))
      .returning();

    logger.info(`[ListImport] Updated list ${listId}`);
    return result[0];
  }

  /**
   * Delete a list
   */
  async deleteList(
    listId: number,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    const list = await this.getListById(listId);
    if (!list) {
      throw new Error("List not found");
    }
    if (!isAdmin && list.userId !== userId) {
      throw new Error("Not authorized to delete this list");
    }

    await db.delete(importLists).where(eq(importLists.id, listId));
    logger.info(`[ListImport] Deleted list ${listId}`);
  }

  /**
   * Get a list by ID
   */
  async getListById(listId: number): Promise<ImportList | null> {
    const result = await db
      .select()
      .from(importLists)
      .where(eq(importLists.id, listId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get all lists for a user
   */
  async getListsForUser(userId: string): Promise<ImportList[]> {
    return db
      .select()
      .from(importLists)
      .where(eq(importLists.userId, userId))
      .orderBy(importLists.createdAt);
  }

  /**
   * Get all lists (admin only)
   */
  async getAllLists(): Promise<ImportList[]> {
    return db.select().from(importLists).orderBy(importLists.createdAt);
  }

  /**
   * Get all enabled lists (for background checker)
   */
  async getAllEnabledLists(): Promise<ImportList[]> {
    return db
      .select()
      .from(importLists)
      .where(eq(importLists.enabled, true))
      .orderBy(importLists.createdAt);
  }

  // ========== Import Processing ==========

  /**
   * Fetch and process a single list
   */
  async fetchAndProcessList(listId: number): Promise<ProcessListResult> {
    // Prevent concurrent fetches for the same list
    if (this.fetchingLists.has(listId)) {
      logger.info(
        `[ListImport] List ${listId} is already being fetched, skipping`,
      );
      return { newBooks: 0, totalBooks: 0, error: "Fetch already in progress" };
    }

    const list = await this.getListById(listId);
    if (!list) {
      return { newBooks: 0, totalBooks: 0, error: "List not found" };
    }

    if (!list.enabled) {
      return { newBooks: 0, totalBooks: 0, error: "List is disabled" };
    }

    // Acquire lock
    this.fetchingLists.add(listId);
    logger.info(`[ListImport] Processing list ${listId} (${list.name})`);

    try {
      const fetcher = getFetcher(list.source as ListSource);
      const allBooks: ListBook[] = [];
      let page = 1;
      let hasMore = true;

      // Fetch all pages
      while (hasMore) {
        const result = await fetcher.fetchBooks(list.sourceConfig, page);

        if (result.error) {
          // Check if this is a "list became private" error - auto-disable
          if (result.error.startsWith("LIST_PRIVATE:")) {
            const errorMessage = result.error.replace("LIST_PRIVATE:", "");
            logger.warn(
              `[ListImport] List ${listId} is now private, auto-disabling`,
            );
            await db
              .update(importLists)
              .set({
                enabled: false,
                fetchError: errorMessage,
                updatedAt: new Date(),
              })
              .where(eq(importLists.id, listId));
            return { newBooks: 0, totalBooks: 0, error: errorMessage };
          }
          // Update list with error
          await this.updateListError(listId, result.error);
          return { newBooks: 0, totalBooks: 0, error: result.error };
        }

        allBooks.push(...result.books);
        hasMore = result.hasMore;
        page = result.nextPage || page + 1;

        // Safety limit to prevent infinite loops
        if (page > 100) {
          logger.warn(`[ListImport] Reached page limit for list ${listId}`);
          break;
        }
      }

      // Get current book hashes for comparison
      const currentHashes = new Set(allBooks.map((b) => b.hash));
      const previousHashes = new Set(list.lastFetchedBookHashes || []);

      // Debug: Log hash comparison
      logger.debug(
        `[ListImport] List ${listId}: previousHashes count = ${previousHashes.size}, currentHashes count = ${currentHashes.size}`,
      );

      // Find new books (in current but not in previous)
      const newBooks = allBooks.filter(
        (book) => !previousHashes.has(book.hash),
      );

      // Debug: Log which books are detected as new
      if (newBooks.length > 0) {
        logger.info(`[ListImport] List ${listId}: Books detected as NEW:`);
        for (const book of newBooks) {
          logger.info(
            `  - "${book.title}" by ${book.author} (hash: ${book.hash})`,
          );
        }
      }

      // Determine what to import based on mode and whether this is the first fetch
      const isInitialFetch = !list.lastFetchedAt;
      let booksToImport: ListBook[];

      if (isInitialFetch) {
        if (list.importMode === "all") {
          // Import all existing books
          booksToImport = allBooks;
        } else {
          // "future" mode: don't import anything on first fetch, just snapshot current state
          booksToImport = [];
          logger.info(
            `[ListImport] List ${listId}: Initial fetch with 'future' mode - snapshotting ${allBooks.length} books without importing`,
          );
        }
      } else {
        // Subsequent fetches: only import genuinely new books
        booksToImport = newBooks;
      }

      logger.info(
        `[ListImport] List ${listId}: ${allBooks.length} total, ${newBooks.length} new, importing ${booksToImport.length}`,
      );

      // Create requests for new books
      let importedCount = 0;
      for (const book of booksToImport) {
        try {
          await this.createRequestForBook(list, book);
          importedCount++;
        } catch (error) {
          logger.error(
            `[ListImport] Failed to create request for "${book.title}":`,
            error,
          );
        }
      }

      // Update list tracking
      await db
        .update(importLists)
        .set({
          lastFetchedAt: new Date(),
          lastFetchedBookHashes: Array.from(currentHashes),
          fetchError: null,
          totalBooksImported: list.totalBooksImported + importedCount,
          updatedAt: new Date(),
        })
        .where(eq(importLists.id, listId));

      return {
        newBooks: importedCount,
        totalBooks: allBooks.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[ListImport] Error processing list ${listId}:`, error);
      await this.updateListError(listId, errorMessage);
      return { newBooks: 0, totalBooks: 0, error: errorMessage };
    } finally {
      // Release lock
      this.fetchingLists.delete(listId);
    }
  }

  /**
   * Create a download request for a book
   */
  private async createRequestForBook(
    list: ImportList,
    book: ListBook,
  ): Promise<void> {
    // Determine language filter:
    // 1. If useBookLanguage is true and book has a language, use that
    // 2. Otherwise, use list's language defaults if set
    // 3. Otherwise, no language filter
    let langFilter: string[] | undefined;
    if (list.useBookLanguage && book.language) {
      langFilter = [book.language];
    } else if (
      list.searchDefaults?.lang &&
      list.searchDefaults.lang.length > 0
    ) {
      langFilter = list.searchDefaults.lang;
    }

    // Build query params from book and list defaults
    const queryParams = {
      author: book.author,
      title: book.title,
      ...(langFilter && { lang: langFilter }),
      ...(list.searchDefaults?.ext && { ext: list.searchDefaults.ext }),
      ...(list.searchDefaults?.content && {
        content: list.searchDefaults.content,
      }),
      ...(list.searchDefaults?.sort && { sort: list.searchDefaults.sort }),
    };

    // Check for existing request with same params
    const existingRequests = await db
      .select()
      .from(downloadRequests)
      .where(
        and(
          eq(downloadRequests.userId, list.userId),
          or(
            eq(downloadRequests.status, "active"),
            eq(downloadRequests.status, "pending_approval"),
          ),
        ),
      );

    // Check if we already have a request for this book
    const paramsString = JSON.stringify({
      author: queryParams.author,
      title: queryParams.title,
    });

    const duplicate = existingRequests.find((req) => {
      const existingParams = JSON.stringify({
        author: (req.queryParams as Record<string, unknown>).author,
        title: (req.queryParams as Record<string, unknown>).title,
      });
      return existingParams === paramsString;
    });

    if (duplicate) {
      logger.debug(
        `[ListImport] Skipping duplicate request for "${book.title}" by ${book.author}`,
      );
      return;
    }

    // Check if user can start downloads
    const canStartDownloads = await permissionsService.canPerform(
      list.userId,
      "canStartDownloads",
    );

    const status = canStartDownloads ? "active" : "pending_approval";

    // Create the request
    const result = await db
      .insert(downloadRequests)
      .values({
        userId: list.userId,
        queryParams,
        status,
        createdAt: Date.now(),
      })
      .returning();

    logger.info(
      `[ListImport] Created ${status} request for "${book.title}" by ${book.author}`,
    );

    // If active, trigger an immediate check
    if (status === "active" && result[0]) {
      requestCheckerService.checkSingleRequest(result[0].id).catch((error) => {
        logger.error(
          `[ListImport] Failed to check request ${result[0].id}:`,
          error,
        );
      });
    }
  }

  /**
   * Update list with an error
   */
  private async updateListError(listId: number, error: string): Promise<void> {
    await db
      .update(importLists)
      .set({
        fetchError: error,
        updatedAt: new Date(),
      })
      .where(eq(importLists.id, listId));
  }
}

export const listImportService = new ListImportService();
