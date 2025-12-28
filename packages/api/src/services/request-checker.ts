import {
  downloadRequestsService,
  type RequestQueryParams,
} from "./download-requests.js";
import { requestsManager } from "./requests-manager.js";
import { aaScraper } from "./scraper.js";
import { queueManager } from "./queue-manager.js";
import { appriseService } from "./apprise.js";
import { bookService } from "./book-service.js";
import { getErrorMessage } from "../utils/logger.js";
import type { SearchQuery } from "@ephemera/shared";

/**
 * Convert RequestQueryParams to SearchQuery
 * Handles type conversions for array fields
 */
function convertToSearchQuery(params: RequestQueryParams): SearchQuery {
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
    page: 1, // Always check first page for requests
    sort: params.sort as SearchQuery["sort"],
    content: toArray(params.content),
    ext: toArray(params.ext),
    lang: toArray(params.lang),
    desc: params.desc,
  };
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
          // Prepare search query
          const searchQuery = convertToSearchQuery(request.queryParams);

          // Run search
          const searchResult = await aaScraper.search(searchQuery);

          if (searchResult.results.length > 0) {
            // Cache search results so queue has book metadata
            await bookService.upsertBooks(searchResult.results);

            // Filter results by requested formats if specified
            let filteredResults = searchResult.results;
            const requestedFormats = searchQuery.ext;
            if (requestedFormats && requestedFormats.length > 0) {
              const formatsUpper = requestedFormats.map((f) => f.toUpperCase());
              filteredResults = searchResult.results.filter(
                (book) =>
                  book.format &&
                  formatsUpper.includes(book.format.toUpperCase()),
              );
              console.log(
                `[Request Checker] Request #${request.id}: Filtered ${searchResult.results.length} results to ${filteredResults.length} matching formats: ${formatsUpper.join(", ")}`,
              );
            }

            if (filteredResults.length === 0) {
              console.log(
                `[Request Checker] Request #${request.id} - no results matching requested format`,
              );
              continue;
            }

            // Found results! Queue the first matching one for download
            const firstBook = filteredResults[0];
            console.log(
              `[Request Checker] Request #${request.id} found match: "${firstBook.title}" (${firstBook.format || "unknown"})`,
            );

            try {
              // Add to download queue using the request owner's user ID
              const queueResult = await queueManager.addToQueue(
                firstBook.md5,
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
              await requestsManager.markFulfilled(request.id, firstBook.md5);

              console.log(
                `[Request Checker] Request #${request.id} fulfilled with book ${firstBook.md5} (${queueResult.status})`,
              );

              // Send Apprise notification
              await appriseService.send("request_fulfilled", {
                query: request.queryParams.q,
                author: request.queryParams.author,
                title: request.queryParams.title,
                bookTitle: firstBook.title,
                bookAuthors: firstBook.authors,
                bookMd5: firstBook.md5,
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

          // Add delay between requests to avoid overloading AA
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

          return { found: true, bookMd5: request.targetBookMd5 };
        } else {
          console.error(
            `[Request Checker] Failed to queue target book for request #${requestId}: ${queueResult.status}`,
          );
          return { found: false, error: `Queue failed: ${queueResult.status}` };
        }
      }

      // No target MD5, perform search
      // Prepare search query
      const searchQuery = convertToSearchQuery(request.queryParams);

      // Run search
      const searchResult = await aaScraper.search(searchQuery);

      if (searchResult.results.length > 0) {
        // Cache search results so queue has book metadata
        await bookService.upsertBooks(searchResult.results);

        // Filter results by requested formats if specified
        let filteredResults = searchResult.results;
        const requestedFormats = searchQuery.ext;
        if (requestedFormats && requestedFormats.length > 0) {
          const formatsUpper = requestedFormats.map((f) => f.toUpperCase());
          filteredResults = searchResult.results.filter(
            (book) =>
              book.format && formatsUpper.includes(book.format.toUpperCase()),
          );
        }

        if (filteredResults.length === 0) {
          return {
            found: false,
            error: "No results matching requested format",
          };
        }

        const firstBook = filteredResults[0];

        // Add to download queue using the request owner's user ID
        const queueResult = await queueManager.addToQueue(
          firstBook.md5,
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
          await requestsManager.markFulfilled(requestId, firstBook.md5);

          console.log(
            `[Request Checker] Single check: Request #${requestId} fulfilled with book ${firstBook.md5} (format: ${firstBook.format}, queue status: ${queueResult.status})`,
          );

          return { found: true, bookMd5: firstBook.md5 };
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
