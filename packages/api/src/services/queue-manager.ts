import { EventEmitter } from "events";
import { eq } from "drizzle-orm";
import {
  downloadTracker,
  type DownloadWithMetadata,
} from "./download-tracker.js";
import { downloader } from "./downloader.js";
import { fileManager } from "../utils/file-manager.js";
import { logger } from "../utils/logger.js";
import { bookloreSettingsService } from "./booklore-settings.js";
import { bookloreUploader } from "./booklore-uploader.js";
import { appSettingsService } from "./app-settings.js";
import { appConfigService } from "./app-config.js";
// Note: appSettingsService is used for pause state persistence
import { appriseService } from "./apprise.js";
import { bookService } from "./book-service.js";
import { indexerSettingsService } from "./indexer-settings.js";
import { emailSettingsService } from "./email-settings.js";
import { emailService } from "./email.js";
import { tolinoSettingsService } from "./tolino-settings.js";
import { tolinoUploadService } from "./tolino/uploader.js";
import { listSettingsService } from "./list-settings.js";
import { calibreService } from "./calibre.js";
import type { CalibreOutputFormat, BookMetadataInput } from "./calibre.js";
import { unlink } from "fs/promises";
import type {
  QueueResponse,
  QueueItem,
  DownloadStatus,
} from "@ephemera/shared";
import { getErrorMessage } from "@ephemera/shared";
import { db } from "../db/index.js";
import {
  downloadRequests,
  bookMetadata,
  type Download,
  type BookMetadata,
} from "../db/schema.js";
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
  private paused: boolean = false;

  constructor() {
    super();
    // Load pause state from database and resume incomplete downloads
    this.initialize();
  }

  /**
   * Initialize queue manager - load pause state and resume downloads
   */
  private async initialize() {
    try {
      this.paused = await appSettingsService.isPaused();
      if (this.paused) {
        logger.info("Queue is paused - downloads will not start until resumed");
      }
    } catch (error) {
      logger.error(
        "Failed to load pause state, defaulting to unpaused:",
        error,
      );
      this.paused = false;
    }
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

  /**
   * Check if downloads are paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Pause all downloads
   * Current download will complete, but no new downloads will start
   */
  async pause(): Promise<void> {
    if (this.paused) {
      logger.info("Queue is already paused");
      return;
    }
    this.paused = true;
    await appSettingsService.setPaused(true);
    logger.info("Queue paused - no new downloads will start");
    this.emitQueueUpdate();
  }

  /**
   * Resume downloads
   */
  async resume(): Promise<void> {
    if (!this.paused) {
      logger.info("Queue is not paused");
      return;
    }
    this.paused = false;
    await appSettingsService.setPaused(false);
    logger.info("Queue resumed - processing will continue");
    this.emitQueueUpdate();
    // Restart processing if there are items in queue
    if (this.queue.length > 0 && !this.isProcessing) {
      this.processQueue();
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
    userId: string,
    downloadSource: "web" | "indexer" | "api" = "web",
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
      // Create new download record with full book metadata
      await downloadTracker.create({
        md5,
        title,
        status: "queued",
        downloadSource,
        userId,
        pathIndex,
        domainIndex,
        queuedAt: Date.now(),
        author: book?.authors?.join(", ") || null,
        publisher: book?.publisher || null,
        language: book?.language || null,
        format: book?.format || null,
        year: book?.year || null,
        filename: book?.filename || null,
        size: book?.size || null,
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

    // Don't start processing if paused
    if (this.paused) {
      logger.info("Queue is paused - not starting new downloads");
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Check if paused before processing next item
      if (this.paused) {
        logger.info("Queue paused - stopping after current download completes");
        break;
      }
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

    // Get max retry attempts from config
    const maxRetryAttempts = await appConfigService.getRetryAttempts();

    // Check retry count
    const retryCount = download.retryCount || 0;
    if (retryCount >= maxRetryAttempts) {
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
      if (updatedDownload && currentRetryCount < maxRetryAttempts) {
        // Increment retry count in database BEFORE re-queueing
        await downloadTracker.update(md5, {
          retryCount: currentRetryCount + 1,
          error: result.error,
        });

        logger.info(
          `Will retry ${md5} (attempt ${currentRetryCount + 1}/${maxRetryAttempts})`,
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

    // Normalize EPUB for Kindle compatibility if enabled
    const format = download.format?.toLowerCase() || "";
    if (format === "epub") {
      const epubSettings = await appSettingsService.getSettings();
      if (epubSettings.postDownloadNormalizeEpub) {
        try {
          if (await calibreService.isAvailable()) {
            logger.info(
              `[Post-Download] Normalizing EPUB for Kindle: ${title}`,
            );
            await calibreService.normalizeEpub(result.filePath);
            logger.success(`[Post-Download] EPUB normalized: ${title}`);
          } else {
            logger.warn(
              `[Post-Download] Calibre unavailable, skipping EPUB normalization`,
            );
          }
        } catch (err) {
          // Non-blocking: continue with original file
          logger.warn(
            `[Post-Download] EPUB normalization failed: ${getErrorMessage(err)}`,
          );
        }
      }
    }

    // Get post-download settings
    const appSettings = await appSettingsService.getSettings();
    const {
      postDownloadMoveToIngest,
      postDownloadUploadToBooklore,
      postDownloadMoveToIndexer,
      postDownloadKeepInDownloads,
    } = appSettings;

    // Post-download format conversion (if enabled)
    const targetFormat = appSettings.postDownloadConvertFormat;
    if (targetFormat) {
      const currentFormat = download.format?.toLowerCase() || "";
      // Skip if already in target format (EPUB normalization handles epub→epub)
      if (currentFormat !== targetFormat) {
        if (calibreService.canConvert(currentFormat, targetFormat)) {
          try {
            if (await calibreService.isAvailable()) {
              logger.info(
                `[Post-Download] Converting ${title} from ${currentFormat.toUpperCase()} to ${targetFormat.toUpperCase()}`,
              );
              const convertedPath = await calibreService.convert(
                result.filePath,
                targetFormat as CalibreOutputFormat,
              );

              // Delete original file
              await unlink(result.filePath);

              // Update result to point to converted file
              result.filePath = convertedPath;

              // Update download record with new format
              await downloadTracker.update(md5, {
                format: targetFormat.toUpperCase(),
              });

              logger.success(
                `[Post-Download] Converted ${title} to ${targetFormat.toUpperCase()}`,
              );
            } else {
              logger.warn(
                `[Post-Download] Calibre unavailable, skipping format conversion`,
              );
            }
          } catch (err) {
            // Non-blocking: continue with original file
            logger.warn(
              `[Post-Download] Format conversion failed: ${getErrorMessage(err)}`,
            );
          }
        } else {
          logger.debug(
            `[Post-Download] Cannot convert ${currentFormat} to ${targetFormat}`,
          );
        }
      }
    }

    // Embed metadata from import list (if available and enabled)
    try {
      const listSettings = await listSettingsService.getSettings();
      if (listSettings.embedMetadataInBooks) {
        const metadata = await this.getMetadataForDownload(md5);
        if (metadata && (await calibreService.isAvailable())) {
          logger.info(`[Post-Download] Embedding metadata: ${title}`);

          const metadataInput: BookMetadataInput = {
            title: metadata.title,
            authors: [metadata.author],
            series: metadata.seriesName || undefined,
            seriesIndex: metadata.seriesPosition ?? undefined,
            description: metadata.description || undefined,
            isbn: metadata.isbn || undefined,
            tags: metadata.genres || undefined,
            coverPath: metadata.coverPath || undefined,
            publishedDate: metadata.publishedYear?.toString() || undefined,
          };

          await calibreService.embedMetadata(result.filePath, metadataInput);
          logger.success(`[Post-Download] Metadata embedded: ${title}`);
        }
      }
    } catch (err) {
      // Non-blocking: continue with original file
      logger.warn(
        `[Post-Download] Metadata embedding failed: ${getErrorMessage(err)}`,
      );
    }

    logger.info(
      `[Post-Download] Settings: moveToIngest=${postDownloadMoveToIngest}, keepInDownloads=${postDownloadKeepInDownloads}, uploadToBooklore=${postDownloadUploadToBooklore}, moveToIndexer=${postDownloadMoveToIndexer}`,
    );

    try {
      let finalPath: string | null = result.filePath;
      let movedToFinal = false;

      // Check if this is an indexer download
      const isIndexerDownload = download.downloadSource === "indexer";

      // Step 1: Move to appropriate directory based on source
      if (isIndexerDownload && postDownloadMoveToIndexer) {
        // Move to indexer directory
        const indexerSettings = await indexerSettingsService.getSettings();
        finalPath = await fileManager.moveToIndexerDirectory(
          result.filePath,
          indexerSettings.indexerCompletedDir,
          indexerSettings.indexerCategoryDir,
        );
        movedToFinal = true;
        logger.info(`[Post-Download] Moved to indexer directory: ${finalPath}`);
      } else if (!isIndexerDownload && postDownloadMoveToIngest) {
        if (postDownloadKeepInDownloads) {
          // Copy to ingest directory, keeping original in downloads folder
          finalPath = await fileManager.copyToFinalDestination(result.filePath);
          movedToFinal = true;
          logger.info(
            `[Post-Download] Copied to ingest directory (keeping original): ${finalPath}`,
          );
        } else {
          // Move to regular ingest directory for non-indexer downloads
          finalPath = await fileManager.moveToFinalDestination(result.filePath);
          movedToFinal = true;
          logger.info(
            `[Post-Download] Moved to ingest directory: ${finalPath}`,
          );
        }
      }

      // Step 2: Upload to Booklore if enabled
      if (postDownloadUploadToBooklore) {
        const isEnabled = await bookloreSettingsService.isEnabled();

        if (isEnabled) {
          try {
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
          } catch (bookloreError: unknown) {
            // Log but don't fail the download
            const errorMsg = getErrorMessage(bookloreError);
            logger.error(
              `[Booklore] Upload error (non-critical):`,
              bookloreError,
            );
            await downloadTracker
              .markUploadFailed(md5, errorMsg)
              .catch(() => {});
          }
        } else {
          logger.warn(
            `[Booklore] Skipping upload for ${title} - Booklore is not enabled or not fully configured`,
          );
        }
      }

      // Mark as available
      await downloadTracker.markAvailable(md5, movedToFinal ? finalPath : null);
      this.emitQueueUpdate();

      if (movedToFinal) {
        logger.success(`${title} is now available at: ${finalPath}`);
      } else if (postDownloadUploadToBooklore) {
        logger.success(`${title} has been uploaded to Booklore`);
      } else {
        logger.success(`${title} download completed`);
      }

      // Send Apprise notification for download available
      await appriseService.send("available", {
        title: item.title,
        authors: book?.authors,
        md5,
        finalPath: movedToFinal
          ? finalPath
          : postDownloadUploadToBooklore
            ? "Booklore"
            : result.filePath,
        format: download.format,
      });

      // Auto-send to the downloader's recipients with auto-send enabled
      // Only send if keepInDownloads is enabled (file must be accessible)
      try {
        const isEmailEnabled = await emailSettingsService.isEnabled();
        if (isEmailEnabled && download.userId && postDownloadKeepInDownloads) {
          // Only send to the downloader's own email recipients with auto-send enabled
          const autoSendRecipients =
            await emailSettingsService.getAutoSendRecipients(download.userId);
          for (const recipient of autoSendRecipients) {
            try {
              logger.info(
                `[Auto-Email] Sending "${title}" to ${recipient.email}`,
              );
              await emailService.sendBook(recipient.id, md5);
              logger.success(
                `[Auto-Email] Sent "${title}" to ${recipient.email}`,
              );

              // Send notification for book sent via email
              await appriseService.send("email_sent", {
                bookTitle: title,
                bookAuthors: book?.authors,
                recipientEmail: recipient.email,
                recipientName: recipient.name,
              });
            } catch (emailError) {
              logger.error(
                `[Auto-Email] Failed to send to ${recipient.email}:`,
                emailError,
              );
            }
          }
        }
      } catch (emailError) {
        logger.error(
          "[Auto-Email] Error checking auto-send recipients:",
          emailError,
        );
      }

      // Auto-upload to Tolino Cloud if user has auto-upload enabled
      // Only upload if keepInDownloads is enabled (file must be accessible)
      try {
        if (download.userId && postDownloadKeepInDownloads) {
          const tolinoSettings = await tolinoSettingsService.getSettings(
            download.userId,
          );
          if (tolinoSettings?.autoUpload) {
            // Determine collection name: series name (if enabled) or default collection
            let collectionName: string | undefined =
              tolinoSettings.autoUploadCollection || undefined;

            if (tolinoSettings.useSeriesAsCollection) {
              const bookMetadata = await this.getMetadataForDownload(md5);
              if (bookMetadata?.seriesName) {
                collectionName = bookMetadata.seriesName;
                logger.info(
                  `[Auto-Tolino] Using series "${collectionName}" as collection`,
                );
              }
            }

            logger.info(`[Auto-Tolino] Uploading "${title}" to Tolino Cloud`);
            const uploadResult = await tolinoUploadService.uploadBook(
              download.userId,
              md5,
              { collectionName },
            );
            if (uploadResult.success) {
              logger.success(
                `[Auto-Tolino] Uploaded "${title}" to Tolino Cloud`,
              );

              // Send notification for book uploaded to Tolino
              await appriseService.send("tolino_uploaded", {
                bookTitle: title,
                bookAuthors: book?.authors,
                collectionName,
              });
            } else {
              logger.error(
                `[Auto-Tolino] Failed to upload "${title}": ${uploadResult.message}`,
              );
            }
          }
        }
      } catch (tolinoError) {
        logger.error("[Auto-Tolino] Error during auto-upload:", tolinoError);
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

  async clearCompletedDownloads(): Promise<number> {
    const CLEARABLE_STATUSES: DownloadStatus[] = [
      "done",
      "available",
      "error",
      "cancelled",
    ];

    try {
      // Get all downloads with clearable statuses
      const downloadsToClear = await Promise.all(
        CLEARABLE_STATUSES.map((status) => downloadTracker.getByStatus(status)),
      );

      // Flatten the array and get MD5s
      const md5sToClear = downloadsToClear.flat().map((d) => d.md5);

      // Remove from in-memory queue (if any are present)
      md5sToClear.forEach((md5) => {
        const index = this.queue.findIndex((q) => q.md5 === md5);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }
      });

      // Delete from database by statuses
      const deletedCount =
        await downloadTracker.deleteByStatuses(CLEARABLE_STATUSES);

      if (deletedCount > 0) {
        await this.emitQueueUpdate();
        logger.info(`Cleared ${deletedCount} completed downloads`);
      }

      return deletedCount;
    } catch (error) {
      logger.error("Failed to clear completed downloads:", error);
      throw error;
    }
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
    // Single JOIN query to get downloads with book and user metadata
    const allWithMetadata = await downloadTracker.getAllWithMetadata();

    // Categorize by status (already sorted by queuedAt from the query)
    const queued: DownloadWithMetadata[] = [];
    const downloading: DownloadWithMetadata[] = [];
    const done: DownloadWithMetadata[] = [];
    const available: DownloadWithMetadata[] = [];
    const delayed: DownloadWithMetadata[] = [];
    const error: DownloadWithMetadata[] = [];
    const cancelled: DownloadWithMetadata[] = [];

    for (const row of allWithMetadata) {
      switch (row.download.status) {
        case "queued":
          queued.push(row);
          break;
        case "downloading":
          downloading.push(row);
          break;
        case "done":
          done.push(row);
          break;
        case "available":
          available.push(row);
          break;
        case "delayed":
          delayed.push(row);
          break;
        case "error":
          error.push(row);
          break;
        case "cancelled":
          cancelled.push(row);
          break;
      }
    }

    // Helper to convert download + metadata to queue item
    const toQueueItem = (row: DownloadWithMetadata): QueueItem => {
      const { download, book, user } = row;
      const queueItem = downloadTracker.downloadToQueueItem(download);

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

        // Add book metadata and user info
        // Prefer download's format (may be updated after conversion) over book's format
        return {
          ...queueItem,
          authors,
          publisher: book.publisher || undefined,
          coverUrl: book.coverUrl || undefined,
          format: download.format || book.format || undefined,
          language: book.language || undefined,
          year: book.year || undefined,
          size: book.size || undefined,
          userId: download.userId,
          userName: user?.name || undefined,
        } as QueueItem;
      }

      // No book metadata, but still include user info
      return {
        ...queueItem,
        userId: download.userId,
        userName: user?.name || undefined,
      } as QueueItem;
    };

    return {
      available: Object.fromEntries(
        available.map((row) => [row.download.md5, toQueueItem(row)]),
      ),
      queued: Object.fromEntries(
        queued.map((row) => [row.download.md5, toQueueItem(row)]),
      ),
      downloading: Object.fromEntries(
        downloading.map((row) => [row.download.md5, toQueueItem(row)]),
      ),
      done: Object.fromEntries(
        done.map((row) => [row.download.md5, toQueueItem(row)]),
      ),
      delayed: Object.fromEntries(
        delayed.map((row) => [row.download.md5, toQueueItem(row)]),
      ),
      error: Object.fromEntries(
        error.map((row) => [row.download.md5, toQueueItem(row)]),
      ),
      cancelled: Object.fromEntries(
        cancelled.map((row) => [row.download.md5, toQueueItem(row)]),
      ),
      paused: this.paused,
    };
  }

  /**
   * Fetch users by IDs for including in queue items
   */
  private async getUsersByIds(
    userIds: string[],
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    if (userIds.length === 0) return [];

    try {
      const { db } = await import("../db/index.js");
      const { user } = await import("../db/schema.js");
      const { inArray } = await import("drizzle-orm");

      const users = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
        })
        .from(user)
        .where(inArray(user.id, userIds));

      return users;
    } catch (error) {
      logger.error("Failed to fetch users for queue items:", error);
      return [];
    }
  }

  async getDownloadStatus(md5: string): Promise<QueueItem | null> {
    const download = await downloadTracker.get(md5);
    if (!download) {
      return null;
    }

    const queueItem = downloadTracker.downloadToQueueItem(download);

    // Try to fetch book details
    const book = await bookService.getBook(md5);

    // Fetch user details (if userId exists)
    const users = download.userId
      ? await this.getUsersByIds([download.userId])
      : [];
    const user = users[0];

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

      // Prefer download's format (may be updated after conversion) over book's format
      return {
        ...queueItem,
        authors,
        publisher: book.publisher || undefined,
        coverUrl: book.coverUrl || undefined,
        format: download.format || book.format || undefined,
        language: book.language || undefined,
        year: book.year || undefined,
        userId: download.userId,
        userName: user?.name || undefined,
        userEmail: user?.email || undefined,
      } as QueueItem;
    }

    return {
      ...queueItem,
      userId: download.userId,
      userName: user?.name || undefined,
      userEmail: user?.email || undefined,
    } as QueueItem;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isDownloading(md5: string): boolean {
    return this.currentDownload === md5;
  }

  removeFromQueue(md5: string): void {
    const index = this.queue.findIndex((item) => item.md5 === md5);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.emitQueueUpdate();
    }
  }

  /**
   * Get book metadata from import list for a download (by MD5)
   * Returns null if no metadata is associated with this download
   */
  private async getMetadataForDownload(
    md5: string,
  ): Promise<BookMetadata | null> {
    try {
      // Find the request that resulted in this download
      const [request] = await db
        .select()
        .from(downloadRequests)
        .where(eq(downloadRequests.fulfilledBookMd5, md5))
        .limit(1);

      if (!request) {
        return null;
      }

      // Get metadata associated with this request
      const [metadata] = await db
        .select()
        .from(bookMetadata)
        .where(eq(bookMetadata.requestId, request.id))
        .limit(1);

      return metadata || null;
    } catch (error) {
      logger.warn(
        `[QueueManager] Failed to get metadata for download ${md5}:`,
        error,
      );
      return null;
    }
  }
}

export const queueManager = new QueueManager();
