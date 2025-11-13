import { EventEmitter } from "events";
import { downloadTracker } from "./download-tracker.js";
import { downloader } from "./downloader.js";
import { fileManager } from "../utils/file-manager.js";
import { logger } from "../utils/logger.js";
import { bookloreSettingsService } from "./booklore-settings.js";
import { bookloreUploader } from "./booklore-uploader.js";
import { appSettingsService } from "./app-settings.js";
import { appriseService } from "./apprise.js";
import { bookService } from "./book-service.js";
import type { QueueResponse, QueueItem } from "@ephemera/shared";
import { getErrorMessage } from "@ephemera/shared";
import type { Download } from "../db/schema.js";

const MAX_RETRY_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS || "3");
const MAX_DELAYED_RETRY_ATTEMPTS = 24; // 24 hours of hourly retries
const DELAYED_RETRY_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

interface QueuedDownload {
  md5: string;
  title: string;
  pathIndex?: number;
  domainIndex?: number;
}

export class QueueManager extends EventEmitter {
  private queue: QueuedDownload[] = [];
  private isProcessing: boolean = false;
  private currentDownload: string | null = null;

  constructor() {
    super();
    // Resume incomplete downloads on startup
    this.resumeIncompleteDownloads();
  }

  /**
   * Emit queue-updated event with current queue status
   */
  private async emitQueueUpdate() {
    try {
      const status = await this.getQueueStatus();
      this.emit("queue-updated", status);
    } catch (error) {
      logger.error("Failed to emit queue update:", error);
    }
  }

  private async resumeIncompleteDownloads() {
    try {
      logger.info("Checking for incomplete downloads...");
      const incomplete = await downloadTracker.getIncomplete();

      if (incomplete.length > 0) {
        logger.info(
          `Found ${incomplete.length} incomplete downloads, resuming...`,
        );

        for (const download of incomplete) {
          // Reset downloading status to queued
          if (download.status === "downloading") {
            await downloadTracker.update(download.md5, { status: "queued" });
          }

          // Keep delayed status - the queue processor will skip it until nextRetryAt
          // No need to reset delayed items

          this.queue.push({
            md5: download.md5,
            title: download.title,
            pathIndex: download.pathIndex || undefined,
            domainIndex: download.domainIndex || undefined,
          });
        }

        // Start processing
        this.processQueue();
      } else {
        logger.info("No incomplete downloads found");
      }
    } catch (error) {
      logger.error("Failed to resume incomplete downloads:", error);
    }
  }

  async addToQueue(
    md5: string,
  ): Promise<{ status: string; position?: number; existing?: Download }> {
    // Get book data from database (should already exist from search)
    const book = await bookService.getBook(md5);
    const title = book?.title || `Book ${md5}`;
    const pathIndex = undefined;
    const domainIndex = undefined;

    // Check if already exists in database
    const existing = await downloadTracker.get(md5);

    if (existing) {
      if (existing.status === "available") {
        return {
          status: "already_downloaded",
          existing,
        };
      }

      if (
        existing.status === "queued" ||
        existing.status === "downloading" ||
        existing.status === "delayed"
      ) {
        const position = this.queue.findIndex((q) => q.md5 === md5);
        return {
          status: "already_in_queue",
          position: position >= 0 ? position + 1 : undefined,
          existing,
        };
      }

      // If error or cancelled, allow re-download
      if (existing.status === "error" || existing.status === "cancelled") {
        logger.info(`Re-queueing ${md5} (previous status: ${existing.status})`);
        await downloadTracker.update(md5, {
          status: "queued",
          error: null,
          queuedAt: Date.now(),
        });
      }
    } else {
      // Create new download record
      await downloadTracker.create({
        md5,
        title,
        status: "queued",
        pathIndex,
        domainIndex,
        queuedAt: Date.now(),
      });
    }

    // Add to queue
    this.queue.push({ md5, title, pathIndex, domainIndex });

    const position = this.queue.length;
    logger.info(`Added ${title} (${md5}) to queue at position ${position}`);

    // Emit queue update
    this.emitQueueUpdate();

    // Send Apprise notification for book queued
    await appriseService.send("book_queued", {
      title,
      authors: book?.authors,
      md5,
      position,
    });

    // Start processing if not already
    if (!this.isProcessing) {
      this.processQueue();
    }

    return { status: "queued", position };
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      // Check if this item is delayed and not ready for retry yet
      const download = await downloadTracker.get(item.md5);
      if (download?.nextRetryAt && download.nextRetryAt > Date.now()) {
        const waitTime = Math.ceil(
          (download.nextRetryAt - Date.now()) / 1000 / 60,
        );
        logger.info(
          `Skipping ${item.md5} - scheduled for retry in ${waitTime} minutes`,
        );
        // Push back to end of queue
        this.queue.push(item);

        // Check if all items in queue are delayed (properly handle async)
        const delayedChecks = await Promise.all(
          this.queue.map(async (q) => {
            const d = await downloadTracker.get(q.md5);
            return d?.nextRetryAt && d.nextRetryAt > Date.now();
          }),
        );

        if (delayedChecks.every((isDelayed) => isDelayed)) {
          logger.info(
            "All items in queue are delayed, pausing queue processing for 5 minutes",
          );
          this.isProcessing = false;
          // Schedule next check in 5 minutes
          setTimeout(() => this.processQueue(), 5 * 60 * 1000);
          return;
        }
        continue;
      }

      this.currentDownload = item.md5;

      // Emit queue update when download starts
      this.emitQueueUpdate();

      try {
        await this.processDownload(item);
      } catch (error) {
        logger.error(`Failed to process download ${item.md5}:`, error);
      }

      this.currentDownload = null;

      // Emit queue update when download finishes
      this.emitQueueUpdate();
    }

    this.isProcessing = false;
    logger.info("Queue processing completed");
  }

  private async processDownload(item: QueuedDownload) {
    const { md5, title, pathIndex, domainIndex } = item;

    logger.info(`Processing download: ${title} (${md5})`);

    const download = await downloadTracker.get(md5);
    if (!download) {
      logger.error(`Download record not found for ${md5}`);
      return;
    }

    // Fetch book data for author information in notifications
    const book = await bookService.getBook(md5);

    // Check retry count
    const retryCount = download.retryCount || 0;
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
      logger.error(`Max retry attempts reached for ${md5}`);
      await downloadTracker.markError(md5, "Max retry attempts reached");
      this.emitQueueUpdate();
      return;
    }

    // Download the file
    const result = await downloader.download({
      md5,
      pathIndex,
      domainIndex,
      onProgress: async (progressInfo) => {
        // Handle countdown updates
        if (
          progressInfo.status === "waiting_countdown" &&
          progressInfo.countdownSeconds &&
          progressInfo.countdownStartedAt
        ) {
          // Check if download was cancelled before updating status
          const currentStatus = await downloadTracker.get(md5);
          if (currentStatus?.status === "cancelled") {
            return; // Don't update if cancelled
          }

          await downloadTracker.markCountdown(
            md5,
            progressInfo.countdownSeconds,
            progressInfo.countdownStartedAt,
          );
          await this.emitQueueUpdate();
        }

        // Handle transition to downloading (clear countdown fields)
        if (progressInfo.status === "downloading") {
          // Check if download was cancelled before updating status
          const currentStatus = await downloadTracker.get(md5);
          if (currentStatus?.status === "cancelled") {
            return; // Don't update if cancelled
          }

          await downloadTracker.clearCountdown(md5);
          await this.emitQueueUpdate();
        }
      },
    });

    if (!result.success) {
      logger.error(`Download failed for ${md5}: ${result.error}`);

      // Check if download was cancelled - don't retry
      const currentStatus = await downloadTracker.get(md5);
      if (currentStatus?.status === "cancelled") {
        logger.info(
          `Download ${md5} was cancelled, skipping retry and error handling`,
        );
        return;
      }

      // Handle quota errors differently (delayed retry)
      if (result.isQuotaError) {
        const updatedDownload = await downloadTracker.get(md5);
        const currentDelayedRetryCount =
          updatedDownload?.delayedRetryCount || 0;

        if (currentDelayedRetryCount < MAX_DELAYED_RETRY_ATTEMPTS) {
          // Calculate next retry time (1 hour from now)
          const nextRetryAt = Date.now() + DELAYED_RETRY_INTERVAL;
          const nextRetryDate = new Date(nextRetryAt).toLocaleString();

          // Increment delayed retry count and mark as delayed
          await downloadTracker.update(md5, {
            status: "delayed",
            error: result.error,
            delayedRetryCount: currentDelayedRetryCount + 1,
            nextRetryAt,
          });

          logger.info(
            `${md5} delayed until ${nextRetryDate} (delayed attempt ${currentDelayedRetryCount + 1}/${MAX_DELAYED_RETRY_ATTEMPTS})`,
          );

          // Send Apprise notification for delayed download
          await appriseService.send("delayed", {
            title: item.title,
            authors: book?.authors,
            md5,
            nextRetryAt,
            delayedRetryCount: currentDelayedRetryCount + 1,
          });

          // Re-queue for later retry
          this.queue.push(item);
        } else {
          // Max delayed retries reached (24 hours)
          const error = `Max delayed retry attempts reached (${MAX_DELAYED_RETRY_ATTEMPTS} hours). Quota may not have reset.`;
          logger.error(`${md5}: ${error}`);
          await downloadTracker.update(md5, {
            status: "error",
            error,
          });
          this.emitQueueUpdate();
        }

        return;
      }

      // Handle regular errors (network, timeouts, etc.) with immediate retries
      const updatedDownload = await downloadTracker.get(md5);
      const currentRetryCount = updatedDownload?.retryCount || 0;
      if (updatedDownload && currentRetryCount < MAX_RETRY_ATTEMPTS) {
        // Increment retry count in database BEFORE re-queueing
        await downloadTracker.update(md5, {
          retryCount: currentRetryCount + 1,
          error: result.error,
        });

        logger.info(
          `Will retry ${md5} (attempt ${currentRetryCount + 1}/${MAX_RETRY_ATTEMPTS})`,
        );
        // Re-queue
        this.queue.push(item);
      } else {
        logger.error(`Max retry attempts reached for ${md5}`);
        const errorMessage = result.error || "Max retry attempts reached";
        await downloadTracker.markError(md5, errorMessage);
        this.emitQueueUpdate();

        // Send Apprise notification for download error
        await appriseService.send("download_error", {
          title: item.title,
          authors: book?.authors,
          md5,
          error: errorMessage,
          retryCount: currentRetryCount,
        });
      }

      return;
    }

    if (!result.filePath) {
      logger.error(`No file path returned for ${md5}`);
      return;
    }

    // Validate download
    const isValid = await fileManager.validateDownload(
      result.filePath,
      download.size || undefined,
    );
    if (!isValid) {
      logger.error(`Downloaded file validation failed for ${md5}`);
      await downloadTracker.markError(md5, "File validation failed");
      this.emitQueueUpdate();
      return;
    }

    // Get post-download action setting
    const appSettings = await appSettingsService.getSettings();
    const postDownloadAction = appSettings.postDownloadAction;

    logger.info(`[Post-Download] Action: ${postDownloadAction}`);

    try {
      switch (postDownloadAction) {
        case "move_only": {
          // Just move to final destination
          const finalPath = await fileManager.moveToFinalDestination(
            result.filePath,
          );
          await downloadTracker.markAvailable(md5, finalPath);
          this.emitQueueUpdate();
          logger.success(`${title} is now available at: ${finalPath}`);

          // Send Apprise notification for download available
          await appriseService.send("available", {
            title: item.title,
            authors: book?.authors,
            md5,
            finalPath,
            format: download.format,
          });

          break;
        }

        case "upload_only": {
          // Upload to Booklore and delete temp file
          const isEnabled = await bookloreSettingsService.isEnabled();

          if (!isEnabled) {
            logger.error(`[Booklore] Cannot upload - Booklore is not enabled`);
            await downloadTracker.markError(
              md5,
              "Post-download action is upload_only but Booklore is not enabled",
            );
            this.emitQueueUpdate();
            return;
          }

          try {
            logger.info(`[Booklore] Uploading ${title}...`);
            await downloadTracker.markUploadPending(md5);
            await downloadTracker.markUploadStarted(md5);

            const uploadResult = await bookloreUploader.uploadFile(
              result.filePath,
            );

            if (uploadResult.success) {
              await downloadTracker.markUploadCompleted(md5);
              logger.success(
                `[Booklore] Successfully uploaded ${title} to Booklore`,
              );

              // Delete temp file after successful upload
              await fileManager.deleteFile(result.filePath);
              logger.info(
                `[Post-Download] Deleted temp file after upload: ${result.filePath}`,
              );

              // Mark as available without a local path (file only exists in Booklore)
              await downloadTracker.markAvailable(md5, null);
              this.emitQueueUpdate();

              // Send Apprise notification for download available (uploaded to Booklore)
              await appriseService.send("available", {
                title: item.title,
                md5,
                finalPath: "Booklore",
                format: download.format,
              });
            } else {
              await downloadTracker.markUploadFailed(
                md5,
                uploadResult.error || "Unknown error",
              );
              logger.error(
                `[Booklore] Failed to upload ${title}: ${uploadResult.error}`,
              );
              await downloadTracker.markError(
                md5,
                `Upload failed: ${uploadResult.error}`,
              );
              this.emitQueueUpdate();
            }
          } catch (bookloreError: unknown) {
            const errorMsg = getErrorMessage(bookloreError);
            logger.error(`[Booklore] Upload error:`, bookloreError);
            await downloadTracker.markUploadFailed(md5, errorMsg);
            await downloadTracker.markError(md5, `Upload error: ${errorMsg}`);
            this.emitQueueUpdate();
          }
          break;
        }

        case "both": {
          // Move to final destination AND upload to Booklore
          const finalPath = await fileManager.moveToFinalDestination(
            result.filePath,
          );
          await downloadTracker.markAvailable(md5, finalPath);
          this.emitQueueUpdate();
          logger.success(`${title} is now available at: ${finalPath}`);

          // Send Apprise notification for download available
          await appriseService.send("available", {
            title: item.title,
            authors: book?.authors,
            md5,
            finalPath,
            format: download.format,
          });

          // Upload to Booklore if enabled
          // This is wrapped in try-catch to ensure upload failures don't affect download completion
          try {
            const isEnabled = await bookloreSettingsService.isEnabled();

            if (isEnabled) {
              logger.info(`[Booklore] Uploading ${title}...`);
              await downloadTracker.markUploadPending(md5);
              await downloadTracker.markUploadStarted(md5);

              const uploadResult = await bookloreUploader.uploadFile(finalPath);

              if (uploadResult.success) {
                await downloadTracker.markUploadCompleted(md5);
                logger.success(
                  `[Booklore] Successfully uploaded ${title} to Booklore`,
                );
              } else {
                await downloadTracker.markUploadFailed(
                  md5,
                  uploadResult.error || "Unknown error",
                );
                logger.error(
                  `[Booklore] Failed to upload ${title}: ${uploadResult.error}`,
                );
              }
            } else {
              logger.warn(
                `[Booklore] Skipping upload for ${title} - Booklore is not enabled or not fully configured (baseUrl, token, libraryId, pathId required)`,
              );
            }
          } catch (bookloreError: unknown) {
            // Log but don't fail the download
            logger.error(
              `[Booklore] Upload error (non-critical):`,
              bookloreError,
            );
            await downloadTracker
              .markUploadFailed(md5, getErrorMessage(bookloreError))
              .catch(() => {});
          }
          break;
        }

        default: {
          logger.error(`[Post-Download] Unknown action: ${postDownloadAction}`);
          await downloadTracker.markError(
            md5,
            `Unknown post-download action: ${postDownloadAction}`,
          );
          this.emitQueueUpdate();
        }
      }
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      logger.error(`Failed to complete post-download action:`, error);
      await downloadTracker.markError(md5, `Post-download error: ${errorMsg}`);
      this.emitQueueUpdate();
    }
  }

  async cancelDownload(md5: string): Promise<boolean> {
    // Remove from queue
    const index = this.queue.findIndex((q) => q.md5 === md5);
    if (index >= 0) {
      this.queue.splice(index, 1);
      await downloadTracker.markCancelled(md5);
      this.emitQueueUpdate();
      logger.info(`Cancelled queued download: ${md5}`);
      return true;
    }

    // Cancel currently downloading file
    if (this.currentDownload === md5) {
      await downloadTracker.markCancelled(md5);
      this.emitQueueUpdate();
      logger.info(
        `Marked currently downloading file as cancelled: ${md5} (download will abort on next status check)`,
      );
      return true;
    }

    return false;
  }

  async deleteDownload(md5: string): Promise<boolean> {
    // Remove from in-memory queue if present
    const index = this.queue.findIndex((q) => q.md5 === md5);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }

    // Delete from database
    const deleted = await downloadTracker.delete(md5);

    if (deleted) {
      await this.emitQueueUpdate();
      logger.info(`Deleted download: ${md5}`);
      return true;
    }

    return false;
  }

  async retryDownload(
    md5: string,
  ): Promise<{ status: string; position?: number }> {
    // Get the download record
    const download = await downloadTracker.get(md5);

    if (!download) {
      throw new Error("Download not found");
    }

    // Only allow retry for error or cancelled downloads
    if (download.status !== "error" && download.status !== "cancelled") {
      throw new Error(`Cannot retry download with status: ${download.status}`);
    }

    logger.info(`Retrying download: ${md5}`);

    // Reset the download status and retry count
    await downloadTracker.update(md5, {
      status: "queued",
      error: null,
      retryCount: 0, // Reset retry count for manual retry
      delayedRetryCount: 0, // Reset delayed retry count too
      nextRetryAt: null,
      queuedAt: Date.now(),
    });

    // Add back to queue
    this.queue.push({
      md5: download.md5,
      title: download.title,
      pathIndex: download.pathIndex || undefined,
      domainIndex: download.domainIndex || undefined,
    });

    const position = this.queue.length;

    // Emit queue update
    this.emitQueueUpdate();

    // Start processing if not already
    if (!this.isProcessing) {
      this.processQueue();
    }

    return { status: "queued", position };
  }

  async getQueueStatus(): Promise<QueueResponse> {
    const allDownloadsFromDb = await downloadTracker.getAll();

    const allDownloads: Download[] = [];
    const downloading: Download[] = [];
    const done: Download[] = [];
    const available: Download[] = [];
    const delayed: Download[] = [];
    const error: Download[] = [];
    const cancelled: Download[] = [];

    for (const download of allDownloadsFromDb) {
      switch (download.status) {
        case "queued":
          allDownloads.push(download);
          break;
        case "downloading":
          downloading.push(download);
          break;
        case "done":
          done.push(download);
          break;
        case "available":
          available.push(download);
          break;
        case "delayed":
          delayed.push(download);
          break;
        case "error":
          error.push(download);
          break;
        case "cancelled":
          cancelled.push(download);
          break;
      }
    }

    // Sort each array by queuedAt descending
    const sortByQueuedAt = (a: Download, b: Download) =>
      (b.queuedAt || 0) - (a.queuedAt || 0);
    allDownloads.sort(sortByQueuedAt);
    downloading.sort(sortByQueuedAt);
    done.sort(sortByQueuedAt);
    available.sort(sortByQueuedAt);
    delayed.sort(sortByQueuedAt);
    error.sort(sortByQueuedAt);
    cancelled.sort(sortByQueuedAt);

    // Get all unique MD5s
    const allMd5s = allDownloadsFromDb.map((d) => d.md5);

    // Fetch all books for these downloads
    const books = await bookService.getBooksByMd5s(allMd5s);
    const booksMap = new Map(books.map((book) => [book.md5, book]));

    // Helper to convert download to queue item with book details
    const toQueueItem = (d: Download): QueueItem => {
      const queueItem = downloadTracker.downloadToQueueItem(d);
      const book = booksMap.get(d.md5);

      if (book) {
        // Ensure authors is always an array (handle both string and array types)
        let authors: string[] | undefined = undefined;
        if (book.authors) {
          if (Array.isArray(book.authors)) {
            authors = book.authors;
          } else if (typeof book.authors === "string") {
            try {
              authors = JSON.parse(book.authors);
            } catch {
              authors = [book.authors];
            }
          }
        }

        // Add book metadata
        return {
          ...queueItem,
          authors,
          publisher: book.publisher || undefined,
          coverUrl: book.coverUrl || undefined,
          format: book.format || undefined,
          language: book.language || undefined,
          year: book.year || undefined,
          size: book.size || undefined,
        };
      }

      return queueItem;
    };

    return {
      available: Object.fromEntries(
        available.map((d) => [d.md5, toQueueItem(d)]),
      ),
      queued: Object.fromEntries(
        allDownloads.map((d) => [d.md5, toQueueItem(d)]),
      ),
      downloading: Object.fromEntries(
        downloading.map((d) => [d.md5, toQueueItem(d)]),
      ),
      done: Object.fromEntries(done.map((d) => [d.md5, toQueueItem(d)])),
      delayed: Object.fromEntries(delayed.map((d) => [d.md5, toQueueItem(d)])),
      error: Object.fromEntries(error.map((d) => [d.md5, toQueueItem(d)])),
      cancelled: Object.fromEntries(
        cancelled.map((d) => [d.md5, toQueueItem(d)]),
      ),
    };
  }

  async getDownloadStatus(md5: string): Promise<QueueItem | null> {
    const download = await downloadTracker.get(md5);
    if (!download) {
      return null;
    }

    const queueItem = downloadTracker.downloadToQueueItem(download);

    // Try to fetch book details
    const book = await bookService.getBook(md5);
    if (book) {
      // Ensure authors is always an array (handle both string and array types)
      let authors: string[] | undefined = undefined;
      if (book.authors) {
        if (Array.isArray(book.authors)) {
          authors = book.authors;
        } else if (typeof book.authors === "string") {
          try {
            authors = JSON.parse(book.authors);
          } catch {
            authors = [book.authors];
          }
        }
      }

      return {
        ...queueItem,
        authors,
        publisher: book.publisher || undefined,
        coverUrl: book.coverUrl || undefined,
        format: book.format || undefined,
        language: book.language || undefined,
        year: book.year || undefined,
      };
    }

    return queueItem;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isDownloading(md5: string): boolean {
    return this.currentDownload === md5;
  }
}

export const queueManager = new QueueManager();
