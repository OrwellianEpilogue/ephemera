import { db } from "../db/index.js";
import { books, downloads } from "../db/schema.js";
import { lt, sql, and } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { appSettingsService } from "./app-settings.js";

/**
 * Book and Download Cleanup Service
 * Removes old books and downloads based on retention period
 * Protects books that have active downloads
 */
class BookCleanupService {
  /**
   * Clean up old books that haven't been seen recently
   * @returns Number of books deleted
   */
  async cleanup(): Promise<number> {
    try {
      const settings = await appSettingsService.getSettings();
      const retentionDays = settings.bookRetentionDays;

      // If retention is 0, disable cleanup
      if (retentionDays <= 0) {
        logger.info("[Book Cleanup] Cleanup disabled (retentionDays = 0)");
        return 0;
      }

      // Calculate cutoff timestamp
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      logger.info(
        `[Book Cleanup] Starting cleanup (retention: ${retentionDays} days, cutoff: ${new Date(cutoffTime).toISOString()})`,
      );

      // Get all books older than retention period
      const oldBooks = await db
        .select({ md5: books.md5 })
        .from(books)
        .where(lt(books.lastSeenAt, cutoffTime))
        .all();

      if (oldBooks.length === 0) {
        logger.info("[Book Cleanup] No old books to clean up");
        return 0;
      }

      logger.info(
        `[Book Cleanup] Found ${oldBooks.length} books older than ${retentionDays} days`,
      );

      // Get MD5s of books with active downloads (protect them from deletion)
      const activeStatuses = ["queued", "downloading", "done", "available"];
      const protectedBooks = await db
        .selectDistinct({ md5: downloads.md5 })
        .from(downloads)
        .where(
          sql`${downloads.status} IN (${sql.join(
            activeStatuses.map((s) => sql`${s}`),
            sql`, `,
          )})`,
        )
        .all();

      const protectedMd5s = new Set(protectedBooks.map((b) => b.md5));

      // Filter out protected books
      const booksToDelete = oldBooks.filter((b) => !protectedMd5s.has(b.md5));

      if (booksToDelete.length === 0) {
        logger.info(
          "[Book Cleanup] All old books have active downloads, skipping cleanup",
        );
        return 0;
      }

      logger.info(
        `[Book Cleanup] Deleting ${booksToDelete.length} books (${protectedMd5s.size} protected)`,
      );

      // Delete books
      const md5sToDelete = booksToDelete.map((b) => b.md5);

      // Delete in batches of 100 to avoid query size limits
      const batchSize = 100;
      let totalDeleted = 0;

      for (let i = 0; i < md5sToDelete.length; i += batchSize) {
        const batch = md5sToDelete.slice(i, i + batchSize);
        await db
          .delete(books)
          .where(
            sql`${books.md5} IN (${sql.join(
              batch.map((md5) => sql`${md5}`),
              sql`, `,
            )})`,
          )
          .run();
        totalDeleted += batch.length;
      }

      logger.info(`[Book Cleanup] Successfully deleted ${totalDeleted} books`);
      return totalDeleted;
    } catch (error) {
      logger.error("[Book Cleanup] Error during cleanup:", error);
      return 0;
    }
  }

  /**
   * Clean up old downloads that are completed or failed
   * @returns Number of downloads deleted
   */
  async cleanupDownloads(): Promise<number> {
    try {
      const settings = await appSettingsService.getSettings();
      const retentionDays = settings.bookRetentionDays;

      // If retention is 0, disable cleanup
      if (retentionDays <= 0) {
        logger.info("[Download Cleanup] Cleanup disabled (retentionDays = 0)");
        return 0;
      }

      // Calculate cutoff timestamp
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      logger.info(
        `[Download Cleanup] Starting cleanup (retention: ${retentionDays} days, cutoff: ${new Date(cutoffTime).toISOString()})`,
      );

      // Delete old downloads in terminal states (error, cancelled, available)
      // Keep active downloads (queued, downloading, delayed)
      const terminalStatuses = ["error", "cancelled", "available"];

      const result = await db
        .delete(downloads)
        .where(
          and(
            lt(downloads.queuedAt, cutoffTime),
            sql`${downloads.status} IN (${sql.join(
              terminalStatuses.map((s) => sql`${s}`),
              sql`, `,
            )})`,
          ),
        )
        .returning({ md5: downloads.md5 });

      const deletedCount = result.length;

      if (deletedCount > 0) {
        logger.info(
          `[Download Cleanup] Successfully deleted ${deletedCount} old downloads`,
        );
      } else {
        logger.info("[Download Cleanup] No old downloads to clean up");
      }

      return deletedCount;
    } catch (error) {
      logger.error("[Download Cleanup] Error during cleanup:", error);
      return 0;
    }
  }

  /**
   * Run both book and download cleanup
   * @returns Object with counts of deleted books and downloads
   */
  async cleanupAll(): Promise<{ books: number; downloads: number }> {
    const [booksDeleted, downloadsDeleted] = await Promise.all([
      this.cleanup(),
      this.cleanupDownloads(),
    ]);

    return {
      books: booksDeleted,
      downloads: downloadsDeleted,
    };
  }
}

// Export singleton instance
export const bookCleanupService = new BookCleanupService();
