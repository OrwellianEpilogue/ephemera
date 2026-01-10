import {
  downloadRequestsService,
  type RequestQueryParams,
} from "./download-requests.js";
import { requestsManager } from "./requests-manager.js";
import { searcherScraper } from "./scraper.js";
import { queueManager } from "./queue-manager.js";
import { downloadTracker } from "./download-tracker.js";
import { appriseService } from "./apprise.js";
import { bookService } from "./book-service.js";
import { listSettingsService } from "./list-settings.js";
import { emailSettingsService } from "./email-settings.js";
import { emailService } from "./email.js";
import { tolinoSettingsService } from "./tolino-settings.js";
import { tolinoUploadService } from "./tolino/uploader.js";
import { appSettingsService } from "./app-settings.js";
import { getErrorMessage } from "../utils/logger.js";
import {
  calculateBookMatchScore,
  isGoodMatch,
} from "../utils/string-matching.js";
import type { SearchQuery, Book } from "@ephemera/shared";

/**
 * Convert RequestQueryParams to SearchQuery
 * Handles type conversions for array fields
 */
function convertToSearchQuery(
  params: RequestQueryParams,
  options?: { includeYear?: boolean },
): SearchQuery {
  // Helper to ensure array format
  const toArray = (
    val: string | string[] | undefined,
  ): string[] | undefined => {
    if (val === undefined) return undefined;
    return Array.isArray(val) ? val : [val];
  };

  return {
    q: params.q || "",
    author: params.author,
    title: params.title,
    year: options?.includeYear ? params.year : undefined,
    page: 1, // Always check first page for requests
    sort: params.sort as SearchQuery["sort"],
    content: toArray(params.content),
    ext: toArray(params.ext),
    lang: toArray(params.lang),
    desc: params.desc,
  };
}

/**
 * Create an ISBN-only search query
 * ISBN search is done by using the ISBN as the main query string
 */
function createIsbnSearchQuery(params: RequestQueryParams): SearchQuery | null {
  if (!params.isbn) return null;

  // Helper to ensure array format
  const toArray = (
    val: string | string[] | undefined,
  ): string[] | undefined => {
    if (val === undefined) return undefined;
    return Array.isArray(val) ? val : [val];
  };

  return {
    q: params.isbn, // Use ISBN as the main search query
    page: 1,
    sort: params.sort as SearchQuery["sort"],
    content: toArray(params.content),
    ext: toArray(params.ext),
    lang: toArray(params.lang),
    desc: params.desc,
  };
}

/**
 * Trigger user-specific post-download actions for an already-downloaded book
 * This sends the book to the user's email recipients and uploads to Tolino if configured
 */
async function triggerPostDownloadActionsForUser(
  md5: string,
  userId: string,
  bookTitle: string,
): Promise<void> {
  // Check if keepInDownloads is enabled (file must be accessible)
  const appSettings = await appSettingsService.getSettings();
  if (!appSettings.postDownloadKeepInDownloads) {
    console.log(
      `[Request Checker] Skipping post-download actions - keepInDownloads is disabled`,
    );
    return;
  }

  // Auto-send to the user's email recipients with auto-send enabled
  try {
    const isEmailEnabled = await emailSettingsService.isEnabled();
    if (isEmailEnabled) {
      const autoSendRecipients =
        await emailSettingsService.getAutoSendRecipients(userId);
      for (const recipient of autoSendRecipients) {
        try {
          console.log(
            `[Request Checker] Auto-sending "${bookTitle}" to ${recipient.email}`,
          );
          await emailService.sendBook(recipient.id, md5);
          console.log(
            `[Request Checker] Successfully sent "${bookTitle}" to ${recipient.email}`,
          );
        } catch (emailError) {
          console.error(
            `[Request Checker] Failed to send "${bookTitle}" to ${recipient.email}:`,
            getErrorMessage(emailError),
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `[Request Checker] Error checking email settings:`,
      getErrorMessage(error),
    );
  }

  // Auto-upload to Tolino Cloud if user has auto-upload enabled
  try {
    const tolinoSettings = await tolinoSettingsService.getSettings(userId);
    if (tolinoSettings?.autoUpload) {
      console.log(
        `[Request Checker] Auto-uploading "${bookTitle}" to Tolino Cloud`,
      );

      // Get collection name if configured
      let collectionName: string | undefined =
        tolinoSettings.autoUploadCollection || undefined;

      const uploadResult = await tolinoUploadService.uploadBook(userId, md5, {
        collectionName,
      });

      if (uploadResult.success) {
        console.log(
          `[Request Checker] Successfully uploaded "${bookTitle}" to Tolino Cloud`,
        );
      } else {
        console.error(
          `[Request Checker] Failed to upload "${bookTitle}" to Tolino Cloud:`,
          uploadResult.message,
        );
      }
    }
  } catch (error) {
    console.error(
      `[Request Checker] Error with Tolino upload:`,
      getErrorMessage(error),
    );
  }
}

/**
 * Find the best matching book from search results
 * Returns the book with the highest match score that hasn't been downloaded yet,
 * or if all matching books are already downloaded, returns the best match regardless
 */
async function findBestMatchingBook(
  results: Book[],
  requestTitle: string | undefined,
  requestAuthor: string | undefined,
  requestedFormats: string | string[] | undefined,
): Promise<{
  book: Book | null;
  isAlreadyDownloaded: boolean;
  matchScore: number;
}> {
  // Filter by format first if specified
  let filteredResults = results;
  const formatsArray = requestedFormats
    ? Array.isArray(requestedFormats)
      ? requestedFormats
      : [requestedFormats]
    : [];

  if (formatsArray.length > 0) {
    const formatsUpper = formatsArray.map((f: string) => f.toUpperCase());
    filteredResults = results.filter(
      (book) => book.format && formatsUpper.includes(book.format.toUpperCase()),
    );
  }

  if (filteredResults.length === 0) {
    return { book: null, isAlreadyDownloaded: false, matchScore: 0 };
  }

  // Calculate match scores for all books
  const booksWithScores = filteredResults.map((book) => ({
    book,
    score: calculateBookMatchScore(
      requestTitle,
      requestAuthor,
      book.title,
      book.authors,
    ),
  }));

  // Sort by score descending
  booksWithScores.sort((a, b) => b.score - a.score);

  // Find the best matching book that's NOT already downloaded
  for (const { book, score } of booksWithScores) {
    // Skip books with very low match scores (likely wrong book)
    if (score < 0.3) continue;

    const downloadRecord = await downloadTracker.getByMd5(book.md5);
    const isDownloaded = downloadRecord?.status === "available";

    if (!isDownloaded) {
      // Book not downloaded yet - this is our best candidate
      return { book, isAlreadyDownloaded: false, matchScore: score };
    }

    // Book is already downloaded - check if it's a good match
    if (isGoodMatch(requestTitle, requestAuthor, book.title, book.authors)) {
      // Already downloaded AND it's a good match - use it
      console.log(
        `[Request Checker] Book "${book.title}" is already downloaded and matches request (score: ${score.toFixed(2)})`,
      );
      return { book, isAlreadyDownloaded: true, matchScore: score };
    } else {
      // Already downloaded but NOT a good match - skip and try next
      console.log(
        `[Request Checker] Book "${book.title}" is already downloaded but doesn't match request well (score: ${score.toFixed(2)}), trying next...`,
      );
    }
  }

  // If we get here, all books are either already downloaded (with bad match) or have low scores
  // Return the best scoring book regardless
  const best = booksWithScores[0];
  if (best && best.score >= 0.3) {
    const downloadRecord = await downloadTracker.getByMd5(best.book.md5);
    return {
      book: best.book,
      isAlreadyDownloaded: downloadRecord?.status === "available",
      matchScore: best.score,
    };
  }

  return { book: null, isAlreadyDownloaded: false, matchScore: 0 };
}

/**
 * Request Checker Service
 * Periodically checks active download requests and auto-downloads books when found
 */
class RequestCheckerService {
  private isRunning = false;

  /**
   * Check all active requests for new results
   * This is the main function called by the background scheduler
   */
  async checkAllRequests(): Promise<void> {
    // Prevent overlapping runs
    if (this.isRunning) {
      console.log("[Request Checker] Already running, skipping...");
      return;
    }

    this.isRunning = true;
    console.log("[Request Checker] Starting check cycle...");

    try {
      const activeRequests = await downloadRequestsService.getActiveRequests();

      if (activeRequests.length === 0) {
        console.log("[Request Checker] No active requests to check");
        return;
      }

      console.log(
        `[Request Checker] Checking ${activeRequests.length} active requests...`,
      );

      let foundCount = 0;
      let errorCount = 0;

      for (const request of activeRequests) {
        try {
          console.log(`[Request Checker] Checking request #${request.id}...`);

          // Skip requests without userId (legacy data from before auth)
          if (!request.userId) {
            console.warn(
              `[Request Checker] Request #${request.id} has no userId (legacy data). Skipping auto-download. Please re-create this request.`,
            );
            continue;
          }

          // Update last checked timestamp
          await downloadRequestsService.updateLastChecked(request.id);

          // If targetBookMd5 is set, queue that book directly without searching
          if (request.targetBookMd5) {
            console.log(
              `[Request Checker] Request #${request.id} has target MD5: ${request.targetBookMd5}. Queueing directly...`,
            );

            try {
              // Add to download queue using the request owner's user ID
              const queueResult = await queueManager.addToQueue(
                request.targetBookMd5,
                request.userId,
              );

              const successStatuses = [
                "queued",
                "already_downloaded",
                "already_in_queue",
              ];
              if (!successStatuses.includes(queueResult.status)) {
                console.error(
                  `[Request Checker] Failed to queue target book for request #${request.id}: ${queueResult.status}`,
                );
                errorCount++;
                continue;
              }

              // Mark request as fulfilled (emits event)
              await requestsManager.markFulfilled(
                request.id,
                request.targetBookMd5,
              );

              console.log(
                `[Request Checker] Request #${request.id} fulfilled with target book ${request.targetBookMd5} (${queueResult.status})`,
              );

              // If book was already downloaded, trigger post-download actions for this user
              if (
                queueResult.status === "already_downloaded" &&
                request.userId
              ) {
                console.log(
                  `[Request Checker] Triggering post-download actions for already-downloaded target book`,
                );
                await triggerPostDownloadActionsForUser(
                  request.targetBookMd5,
                  request.userId,
                  request.queryParams.title || "Requested Book",
                );
              }

              // Send Apprise notification
              await appriseService.send("request_fulfilled", {
                query: request.queryParams.q,
                author: request.queryParams.author,
                title: request.queryParams.title,
                bookTitle: request.queryParams.title || "Requested Book",
                bookMd5: request.targetBookMd5,
              });

              foundCount++;
            } catch (queueError: unknown) {
              console.error(
                `[Request Checker] Error queuing target download for request #${request.id}:`,
                getErrorMessage(queueError),
              );
              errorCount++;
            }
            continue;
          }

          // No target MD5, perform search
          // Get search settings
          const listSettings = await listSettingsService.getSettings();
          const { searchByIsbnFirst, includeYearInSearch } = listSettings;

          let searchResult;
          const hasYear = !!request.queryParams.year;

          // Try ISBN search first if enabled and ISBN is available
          if (searchByIsbnFirst && request.queryParams.isbn) {
            const isbnQuery = createIsbnSearchQuery(request.queryParams);
            if (isbnQuery) {
              console.log(
                `[Request Checker] Request #${request.id}: Trying ISBN search first: ${request.queryParams.isbn}`,
              );
              searchResult = await searcherScraper.search(isbnQuery);

              if (searchResult.results.length > 0) {
                console.log(
                  `[Request Checker] Request #${request.id}: ISBN search found ${searchResult.results.length} results`,
                );
              } else {
                console.log(
                  `[Request Checker] Request #${request.id}: ISBN search returned no results, falling back to title/author`,
                );
              }
            }
          }

          // Fall back to title/author search if ISBN didn't find anything
          if (!searchResult || searchResult.results.length === 0) {
            // First try with year if enabled and year is present
            if (includeYearInSearch && hasYear) {
              const searchQueryWithYear = convertToSearchQuery(
                request.queryParams,
                { includeYear: true },
              );
              console.log(
                `[Request Checker] Request #${request.id}: Searching with year filter (${request.queryParams.year})`,
              );
              searchResult = await searcherScraper.search(searchQueryWithYear);

              // If no results with year, retry without year
              if (searchResult.results.length === 0) {
                console.log(
                  `[Request Checker] Request #${request.id}: No results with year, retrying without year filter`,
                );
                const searchQueryNoYear = convertToSearchQuery(
                  request.queryParams,
                  { includeYear: false },
                );
                searchResult = await searcherScraper.search(searchQueryNoYear);
              }
            } else {
              // Search without year
              const searchQuery = convertToSearchQuery(request.queryParams, {
                includeYear: false,
              });
              searchResult = await searcherScraper.search(searchQuery);
            }
          }

          if (searchResult.results.length > 0) {
            // Cache search results so queue has book metadata
            await bookService.upsertBooks(searchResult.results);

            // Find the best matching book (handles format filtering, similarity scoring, and already-downloaded checks)
            const {
              book: bestBook,
              isAlreadyDownloaded,
              matchScore,
            } = await findBestMatchingBook(
              searchResult.results,
              request.queryParams.title,
              request.queryParams.author,
              request.queryParams.ext,
            );

            if (!bestBook) {
              console.log(
                `[Request Checker] Request #${request.id} - no suitable matching book found in ${searchResult.results.length} results`,
              );
              continue;
            }

            console.log(
              `[Request Checker] Request #${request.id} found best match: "${bestBook.title}" by ${bestBook.authors?.join(", ") || "Unknown"} (score: ${matchScore.toFixed(2)}, format: ${bestBook.format || "unknown"}, already downloaded: ${isAlreadyDownloaded})`,
            );

            try {
              // Add to download queue using the request owner's user ID
              const queueResult = await queueManager.addToQueue(
                bestBook.md5,
                request.userId,
              );

              const successStatuses = [
                "queued",
                "already_downloaded",
                "already_in_queue",
              ];
              if (!successStatuses.includes(queueResult.status)) {
                console.error(
                  `[Request Checker] Failed to queue book for request #${request.id}: ${queueResult.status}`,
                );
                errorCount++;
                continue;
              }

              // Mark request as fulfilled (emits event)
              await requestsManager.markFulfilled(request.id, bestBook.md5);

              console.log(
                `[Request Checker] Request #${request.id} fulfilled with book ${bestBook.md5} (${queueResult.status})`,
              );

              // If book was already downloaded, trigger post-download actions for this user
              if (isAlreadyDownloaded && request.userId) {
                console.log(
                  `[Request Checker] Triggering post-download actions for already-downloaded book`,
                );
                await triggerPostDownloadActionsForUser(
                  bestBook.md5,
                  request.userId,
                  bestBook.title,
                );
              }

              // Send Apprise notification
              await appriseService.send("request_fulfilled", {
                query: request.queryParams.q,
                author: request.queryParams.author,
                title: request.queryParams.title,
                bookTitle: bestBook.title,
                bookAuthors: bestBook.authors,
                bookMd5: bestBook.md5,
              });

              foundCount++;
            } catch (queueError: unknown) {
              console.error(
                `[Request Checker] Error queuing download for request #${request.id}:`,
                getErrorMessage(queueError),
              );
              // Don't mark as fulfilled if queue fails
              errorCount++;
            }
          } else {
            console.log(
              `[Request Checker] Request #${request.id} - no results yet`,
            );
          }

          // Add delay between requests to avoid overloading searcher
          await this.delay(2000); // 2 second delay between requests
        } catch (error: unknown) {
          console.error(
            `[Request Checker] Error checking request #${request.id}:`,
            getErrorMessage(error),
          );
          errorCount++;
          // Continue with next request
        }
      }

      console.log(
        `[Request Checker] Check cycle complete. Found: ${foundCount}, Errors: ${errorCount}, Checked: ${activeRequests.length}`,
      );
    } catch (error: unknown) {
      console.error(
        "[Request Checker] Fatal error in check cycle:",
        getErrorMessage(error),
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check a single request manually (useful for testing or immediate checks)
   */
  async checkSingleRequest(
    requestId: number,
  ): Promise<{ found: boolean; bookMd5?: string; error?: string }> {
    try {
      const request = await downloadRequestsService.getRequestById(requestId);

      if (!request) {
        return { found: false, error: "Request not found" };
      }

      if (request.status !== "active") {
        return { found: false, error: "Request is not active" };
      }

      // Skip requests without userId (legacy data from before auth)
      if (!request.userId) {
        return {
          found: false,
          error:
            "Request has no userId (legacy data). Please re-create this request.",
        };
      }

      // Update last checked timestamp
      await downloadRequestsService.updateLastChecked(requestId);

      // If targetBookMd5 is set, queue that book directly without searching
      if (request.targetBookMd5) {
        console.log(
          `[Request Checker] Single check: Request #${requestId} has target MD5: ${request.targetBookMd5}. Queueing directly...`,
        );

        // Add to download queue using the request owner's user ID
        const queueResult = await queueManager.addToQueue(
          request.targetBookMd5,
          request.userId,
        );

        const successStatuses = [
          "queued",
          "already_downloaded",
          "already_in_queue",
        ];
        if (successStatuses.includes(queueResult.status)) {
          // Mark request as fulfilled (emits event)
          await requestsManager.markFulfilled(requestId, request.targetBookMd5);

          console.log(
            `[Request Checker] Single check: Request #${requestId} fulfilled with target book ${request.targetBookMd5} (queue status: ${queueResult.status})`,
          );

          // If book was already downloaded, trigger post-download actions for this user
          if (queueResult.status === "already_downloaded" && request.userId) {
            console.log(
              `[Request Checker] Single check: Triggering post-download actions for already-downloaded target book`,
            );
            await triggerPostDownloadActionsForUser(
              request.targetBookMd5,
              request.userId,
              request.queryParams.title || "Requested Book",
            );
          }

          return { found: true, bookMd5: request.targetBookMd5 };
        } else {
          console.error(
            `[Request Checker] Failed to queue target book for request #${requestId}: ${queueResult.status}`,
          );
          return { found: false, error: `Queue failed: ${queueResult.status}` };
        }
      }

      // No target MD5, perform search
      // Get search settings
      const listSettings = await listSettingsService.getSettings();
      const { searchByIsbnFirst, includeYearInSearch } = listSettings;

      let searchResult;
      const hasYear = !!request.queryParams.year;

      // Try ISBN search first if enabled and ISBN is available
      if (searchByIsbnFirst && request.queryParams.isbn) {
        const isbnQuery = createIsbnSearchQuery(request.queryParams);
        if (isbnQuery) {
          console.log(
            `[Request Checker] Single check: Request #${requestId}: Trying ISBN search first: ${request.queryParams.isbn}`,
          );
          searchResult = await searcherScraper.search(isbnQuery);

          if (searchResult.results.length === 0) {
            console.log(
              `[Request Checker] Single check: Request #${requestId}: ISBN search returned no results, falling back to title/author`,
            );
          }
        }
      }

      // Fall back to title/author search if ISBN didn't find anything
      if (!searchResult || searchResult.results.length === 0) {
        // First try with year if enabled and year is present
        if (includeYearInSearch && hasYear) {
          const searchQueryWithYear = convertToSearchQuery(
            request.queryParams,
            { includeYear: true },
          );
          console.log(
            `[Request Checker] Single check: Request #${requestId}: Searching with year filter (${request.queryParams.year})`,
          );
          searchResult = await searcherScraper.search(searchQueryWithYear);

          // If no results with year, retry without year
          if (searchResult.results.length === 0) {
            console.log(
              `[Request Checker] Single check: Request #${requestId}: No results with year, retrying without year filter`,
            );
            const searchQueryNoYear = convertToSearchQuery(
              request.queryParams,
              { includeYear: false },
            );
            searchResult = await searcherScraper.search(searchQueryNoYear);
          }
        } else {
          // Search without year
          const searchQuery = convertToSearchQuery(request.queryParams, {
            includeYear: false,
          });
          searchResult = await searcherScraper.search(searchQuery);
        }
      }

      if (searchResult.results.length > 0) {
        // Cache search results so queue has book metadata
        await bookService.upsertBooks(searchResult.results);

        // Find the best matching book (handles format filtering, similarity scoring, and already-downloaded checks)
        const {
          book: bestBook,
          isAlreadyDownloaded,
          matchScore,
        } = await findBestMatchingBook(
          searchResult.results,
          request.queryParams.title,
          request.queryParams.author,
          request.queryParams.ext,
        );

        if (!bestBook) {
          return {
            found: false,
            error: `No suitable matching book found in ${searchResult.results.length} results`,
          };
        }

        console.log(
          `[Request Checker] Single check: Request #${requestId} found best match: "${bestBook.title}" (score: ${matchScore.toFixed(2)}, format: ${bestBook.format}, already downloaded: ${isAlreadyDownloaded})`,
        );

        // Add to download queue using the request owner's user ID
        const queueResult = await queueManager.addToQueue(
          bestBook.md5,
          request.userId,
        );

        // Only mark as fulfilled if the book was actually queued or already downloaded
        const successStatuses = [
          "queued",
          "already_downloaded",
          "already_in_queue",
        ];
        if (successStatuses.includes(queueResult.status)) {
          // Mark request as fulfilled (emits event)
          await requestsManager.markFulfilled(requestId, bestBook.md5);

          console.log(
            `[Request Checker] Single check: Request #${requestId} fulfilled with book ${bestBook.md5} (format: ${bestBook.format}, queue status: ${queueResult.status})`,
          );

          // If book was already downloaded, trigger post-download actions for this user
          if (isAlreadyDownloaded && request.userId) {
            console.log(
              `[Request Checker] Single check: Triggering post-download actions for already-downloaded book`,
            );
            await triggerPostDownloadActionsForUser(
              bestBook.md5,
              request.userId,
              bestBook.title,
            );
          }

          return { found: true, bookMd5: bestBook.md5 };
        } else {
          console.error(
            `[Request Checker] Failed to queue book for request #${requestId}: ${queueResult.status}`,
          );
          return { found: false, error: `Queue failed: ${queueResult.status}` };
        }
      }

      return { found: false };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(
        `[Request Checker] Error in single check for request #${requestId}:`,
        errorMessage,
      );
      return { found: false, error: errorMessage };
    }
  }

  /**
   * Get current running status
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const requestCheckerService = new RequestCheckerService();
