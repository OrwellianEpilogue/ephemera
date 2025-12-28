import { listImportService } from "./list-import.js";
import { listSettingsService } from "./list-settings.js";
import { logger } from "../utils/logger.js";

/**
 * List Checker Service
 * Periodically checks all enabled lists for new books
 */
class ListCheckerService {
  private isRunning = false;

  /**
   * Check all enabled lists for new books
   * This is the main function called by the background scheduler
   */
  async checkAllLists(): Promise<void> {
    // Prevent overlapping runs
    if (this.isRunning) {
      logger.debug("[ListChecker] Already running, skipping...");
      return;
    }

    this.isRunning = true;
    logger.info("[ListChecker] Starting check cycle...");

    try {
      const lists = await listImportService.getAllEnabledLists();

      if (lists.length === 0) {
        logger.debug("[ListChecker] No enabled lists to check");
        return;
      }

      logger.info(`[ListChecker] Checking ${lists.length} lists...`);

      let processedCount = 0;
      let newBooksTotal = 0;
      let errorCount = 0;

      for (const list of lists) {
        try {
          // Stagger fetches to avoid overloading external servers
          // Wait 3-5 seconds between each list
          if (processedCount > 0) {
            const delay = 3000 + Math.random() * 2000;
            await this.delay(delay);
          }

          logger.info(
            `[ListChecker] Processing list ${list.id} (${list.name})...`,
          );

          const result = await listImportService.fetchAndProcessList(list.id);

          if (result.error) {
            logger.warn(
              `[ListChecker] List ${list.id} had error: ${result.error}`,
            );
            errorCount++;
          } else {
            newBooksTotal += result.newBooks;
            logger.info(
              `[ListChecker] List ${list.id}: ${result.newBooks} new books`,
            );
          }

          processedCount++;
        } catch (error) {
          logger.error(
            `[ListChecker] Error processing list ${list.id}:`,
            error,
          );
          errorCount++;
        }
      }

      logger.info(
        `[ListChecker] Check cycle complete. Processed: ${processedCount}, New books: ${newBooksTotal}, Errors: ${errorCount}`,
      );
    } catch (error) {
      logger.error("[ListChecker] Fatal error in check cycle:", error);
    } finally {
      this.isRunning = false;
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
export const listCheckerService = new ListCheckerService();

// ========== Background Scheduler ==========

let listCheckerInterval: NodeJS.Timeout | null = null;

/**
 * Start the list checker background interval
 */
export async function startListChecker(): Promise<void> {
  // Stop existing interval if running
  if (listCheckerInterval) {
    clearInterval(listCheckerInterval);
    listCheckerInterval = null;
  }

  try {
    const intervalMs = await listSettingsService.getFetchIntervalMs();

    logger.info(
      `[ListChecker] Starting background checker with interval: ${intervalMs / 1000 / 60} minutes`,
    );

    // Run initial check after a short delay (don't block startup)
    setTimeout(() => {
      listCheckerService.checkAllLists().catch((error) => {
        logger.error("[ListChecker] Initial check failed:", error);
      });
    }, 10000); // 10 second delay after startup

    // Set up interval
    listCheckerInterval = setInterval(async () => {
      try {
        await listCheckerService.checkAllLists();
      } catch (error) {
        logger.error("[ListChecker] Interval check failed:", error);
      }
    }, intervalMs);
  } catch (error) {
    logger.error("[ListChecker] Failed to start background checker:", error);
  }
}

/**
 * Stop the list checker background interval
 */
export function stopListChecker(): void {
  if (listCheckerInterval) {
    clearInterval(listCheckerInterval);
    listCheckerInterval = null;
    logger.info("[ListChecker] Background checker stopped");
  }
}

/**
 * Restart the list checker with updated interval
 */
export async function restartListChecker(): Promise<void> {
  await startListChecker();
}
