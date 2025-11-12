import {
  downloadRequestsService,
  type RequestQueryParams,
} from "./download-requests.js";
import { requestsManager } from "./requests-manager.js";
import { aaScraper } from "./scraper.js";
import { queueManager } from "./queue-manager.js";
import { appriseService } from "./apprise.js";
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

          // Update last checked timestamp
          await downloadRequestsService.updateLastChecked(request.id);

          // Prepare search query
          const searchQuery = convertToSearchQuery(request.queryParams);

          // Run search
          const searchResult = await aaScraper.search(searchQuery);

          if (searchResult.results.length > 0) {
            // Found results! Queue the first one for download
            const firstBook = searchResult.results[0];
            console.log(
              `[Request Checker] Request #${request.id} found results! Queuing: ${firstBook.title}`,
            );

            try {
              // Add to download queue
              const queueResult = await queueManager.addToQueue(firstBook.md5);

              // Mark request as fulfilled (emits event)
              await requestsManager.markFulfilled(request.id, firstBook.md5);

              console.log(
                `[Request Checker] Request #${request.id} fulfilled with book ${firstBook.md5} (${queueResult.status})`,
              );

              // Send Apprise notification
              await appriseService.send("request_fulfilled", {
                query: request.queryParams.q,
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

      // Update last checked timestamp
      await downloadRequestsService.updateLastChecked(requestId);

      // Prepare search query
      const searchQuery = convertToSearchQuery(request.queryParams);

      // Run search
      const searchResult = await aaScraper.search(searchQuery);

      if (searchResult.results.length > 0) {
        const firstBook = searchResult.results[0];

        // Add to download queue
        await queueManager.addToQueue(firstBook.md5);

        // Mark request as fulfilled (emits event)
        await requestsManager.markFulfilled(requestId, firstBook.md5);

        console.log(
          `[Request Checker] Single check: Request #${requestId} fulfilled with book ${firstBook.md5}`,
        );

        return { found: true, bookMd5: firstBook.md5 };
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
