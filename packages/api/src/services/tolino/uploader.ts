import { existsSync } from "fs";
import { unlink } from "fs/promises";
import { basename, extname, join } from "path";
import { TolinoApiClient } from "./api.js";
import { tolinoAuthService, type TolinoTokens } from "./auth.js";
import type { ResellerId } from "./resellers.js";
import { calibreService } from "../calibre.js";
import { downloadTracker } from "../download-tracker.js";
import { bookService } from "../book-service.js";
import { logger } from "../../utils/logger.js";
import { db } from "../../db/index.js";
import { tolinoSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";

// Formats that Tolino Cloud accepts directly
const TOLINO_FORMATS = ["epub", "pdf"];

export interface UploadOptions {
  skipCover?: boolean;
  collectionName?: string;
}

export interface UploadResult {
  success: boolean;
  message: string;
  uploadedAt?: number;
  collectionAdded?: boolean;
  collectionError?: string;
}

export interface CanUploadResult {
  canUpload: boolean;
  needsConversion: boolean;
  reason?: string;
}

/**
 * Tolino Upload Service
 * Orchestrates the complete book upload flow to Tolino Cloud
 */
class TolinoUploadService {
  /**
   * Upload a book to Tolino Cloud
   */
  async uploadBook(
    userId: string,
    md5: string,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    logger.info(
      `[Tolino Upload] Starting upload for book ${md5} by user ${userId}`,
    );

    try {
      // 1. Get user's Tolino settings
      const settings = await this.getSettings(userId);
      if (!settings) {
        return {
          success: false,
          message: "Tolino Cloud is not configured",
        };
      }

      // 2. Get download info
      const download = await downloadTracker.get(md5);
      if (!download) {
        return {
          success: false,
          message: "Book not found in downloads",
        };
      }

      // 3. Check if file exists - prefer finalPath as tempPath may have been moved
      let filePath: string | null = null;
      if (download.finalPath && existsSync(download.finalPath)) {
        filePath = download.finalPath;
      } else if (download.tempPath && existsSync(download.tempPath)) {
        filePath = download.tempPath;
      }

      if (!filePath) {
        logger.warn(
          `[Tolino Upload] File not found. tempPath: ${download.tempPath}, finalPath: ${download.finalPath}`,
        );
        return {
          success: false,
          message: "Book file is not available",
        };
      }

      // 4. Validate/refresh tokens
      const tokens = await this.ensureValidTokens(settings);

      // 5. Determine if format conversion is needed
      const format = (
        download.format ||
        extname(filePath).slice(1) ||
        ""
      ).toLowerCase();
      let uploadPath = filePath;
      let tempConvertedPath: string | null = null;

      if (!TOLINO_FORMATS.includes(format)) {
        // Need to convert
        const calibreAvailable = await calibreService.isAvailable();
        if (!calibreAvailable) {
          return {
            success: false,
            message: `Cannot upload ${format.toUpperCase()} files - Calibre is not available for conversion`,
          };
        }

        logger.info(`[Tolino Upload] Converting ${format} to EPUB...`);
        try {
          tempConvertedPath = await calibreService.convert(filePath, "epub");
          uploadPath = tempConvertedPath;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            message: `Format conversion failed: ${message}`,
          };
        }
      }

      // 6. Create API client and upload book
      const client = new TolinoApiClient(
        tokens.accessToken,
        settings.hardwareId || tolinoAuthService.generateHardwareId(),
        settings.resellerId as ResellerId,
      );

      // Use converted file's name if conversion happened, otherwise original filename
      const filename = tempConvertedPath
        ? basename(uploadPath)
        : download.filename || basename(uploadPath);
      const uploadResult = await client.uploadBook(uploadPath, filename);

      if (!uploadResult.success) {
        return {
          success: false,
          message: uploadResult.error || "Upload failed",
        };
      }

      // 7. Upload cover if available and we got an inventory UUID
      if (!options.skipCover && uploadResult.inventoryUuid) {
        await this.uploadCover(
          client,
          uploadResult.inventoryUuid,
          md5,
          filePath,
        );
      }

      // 8. Add to collection if requested and we have an inventory UUID
      let collectionAdded = false;
      let collectionError: string | undefined;

      if (options.collectionName && uploadResult.inventoryUuid) {
        logger.info(
          `[Tolino Upload] Adding book to collection "${options.collectionName}"`,
        );

        try {
          // Get current revision
          const metadataResult = await client.getReadingMetadata();
          if (!metadataResult.success) {
            collectionError = metadataResult.error || "Failed to get metadata";
          } else {
            // Add to collection
            const collectionResult = await client.addToCollection(
              metadataResult.revision,
              uploadResult.inventoryUuid,
              options.collectionName,
            );

            if (collectionResult.success) {
              collectionAdded = true;
              logger.info(
                `[Tolino Upload] Book added to collection "${options.collectionName}"`,
              );
            } else {
              collectionError =
                collectionResult.error || "Failed to add to collection";
              logger.warn(
                `[Tolino Upload] Failed to add to collection: ${collectionError}`,
              );
            }
          }
        } catch (error) {
          collectionError =
            error instanceof Error ? error.message : "Unknown collection error";
          logger.warn(`[Tolino Upload] Collection error: ${collectionError}`);
        }
      }

      // 9. Cleanup temp converted file
      if (tempConvertedPath) {
        try {
          await unlink(tempConvertedPath);
        } catch {
          logger.warn(
            `[Tolino Upload] Failed to cleanup temp file: ${tempConvertedPath}`,
          );
        }
      }

      logger.info(`[Tolino Upload] Upload complete for book ${md5}`);

      return {
        success: true,
        message: collectionAdded
          ? `Book uploaded and added to collection "${options.collectionName}"`
          : collectionError
            ? `Book uploaded, but failed to add to collection: ${collectionError}`
            : "Book uploaded successfully",
        uploadedAt: Date.now(),
        collectionAdded,
        collectionError,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Tolino Upload] Upload failed: ${message}`);
      return {
        success: false,
        message,
      };
    }
  }

  /**
   * Upload cover image for a book
   * Tries to extract from the ebook file first (fast), falls back to URL download
   */
  private async uploadCover(
    client: TolinoApiClient,
    inventoryUuid: string,
    md5: string,
    bookFilePath: string,
  ): Promise<void> {
    try {
      const tempDir = process.env.DOWNLOAD_FOLDER || "./downloads";
      const coverPath = join(tempDir, `${md5}_cover.jpg`);

      // Try extracting cover from the ebook file first (fast, local)
      let extractedCover: string | null = null;
      if (await calibreService.isAvailable()) {
        logger.debug(`[Tolino Upload] Extracting cover from ebook file`);
        extractedCover = await calibreService.extractCover(
          bookFilePath,
          coverPath,
        );
      }

      // Fall back to downloading from URL if extraction failed
      if (!extractedCover) {
        const book = await bookService.getBook(md5);
        if (book?.coverUrl) {
          logger.debug(
            `[Tolino Upload] Downloading cover from ${book.coverUrl}`,
          );
          extractedCover = await this.downloadCoverWithTimeout(
            book.coverUrl,
            coverPath,
          );
        }
      }

      if (!extractedCover) {
        logger.debug(`[Tolino Upload] No cover available`);
        return;
      }

      logger.debug(`[Tolino Upload] Uploading cover to Tolino`);

      // Upload cover with timeout
      const result = await Promise.race([
        client.uploadCover(inventoryUuid, extractedCover),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(
            () => resolve({ success: false, error: "Cover upload timeout" }),
            10000,
          ),
        ),
      ]);

      if (!result.success) {
        logger.warn(`[Tolino Upload] Cover upload failed: ${result.error}`);
      } else {
        logger.debug(`[Tolino Upload] Cover uploaded successfully`);
      }

      // Cleanup temp cover file
      try {
        await unlink(extractedCover);
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`[Tolino Upload] Cover processing error: ${message}`);
      // Cover upload errors are non-blocking
    }
  }

  /**
   * Download cover image from URL with timeout
   */
  private async downloadCoverWithTimeout(
    coverUrl: string,
    outputPath: string,
  ): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(coverUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      const { writeFile } = await import("fs/promises");
      await writeFile(outputPath, Buffer.from(buffer));

      return outputPath;
    } catch (error) {
      logger.debug(`[Tolino Upload] Failed to download cover: ${error}`);
      return null;
    }
  }

  /**
   * Check if a book can be uploaded to Tolino
   */
  async canUpload(md5: string): Promise<CanUploadResult> {
    const download = await downloadTracker.get(md5);
    if (!download) {
      return {
        canUpload: false,
        needsConversion: false,
        reason: "Book not found",
      };
    }

    // Check if file exists - prefer finalPath as tempPath may have been moved
    let filePath: string | null = null;
    if (download.finalPath && existsSync(download.finalPath)) {
      filePath = download.finalPath;
    } else if (download.tempPath && existsSync(download.tempPath)) {
      filePath = download.tempPath;
    }

    if (!filePath) {
      return {
        canUpload: false,
        needsConversion: false,
        reason: "Book file is not available",
      };
    }

    const format = (
      download.format ||
      extname(filePath).slice(1) ||
      ""
    ).toLowerCase();

    if (TOLINO_FORMATS.includes(format)) {
      return {
        canUpload: true,
        needsConversion: false,
      };
    }

    // Check if Calibre can convert
    const calibreAvailable = await calibreService.isAvailable();
    if (!calibreAvailable) {
      return {
        canUpload: false,
        needsConversion: true,
        reason: `Cannot convert ${format.toUpperCase()} - Calibre is not available`,
      };
    }

    if (!calibreService.canConvert(format, "epub")) {
      return {
        canUpload: false,
        needsConversion: true,
        reason: `Cannot convert ${format.toUpperCase()} to EPUB`,
      };
    }

    return {
      canUpload: true,
      needsConversion: true,
    };
  }

  /**
   * Test Tolino connection with current settings
   */
  async testConnection(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const settings = await this.getSettings(userId);
      if (!settings) {
        return {
          success: false,
          message: "Tolino Cloud is not configured",
        };
      }

      // Try to refresh tokens or login
      await this.ensureValidTokens(settings);

      return {
        success: true,
        message: "Connection successful",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message,
      };
    }
  }

  /**
   * Get user's Tolino settings from database
   */
  private async getSettings(userId: string) {
    const result = await db
      .select()
      .from(tolinoSettings)
      .where(eq(tolinoSettings.userId, userId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Ensure we have valid tokens, refreshing if needed
   */
  private async ensureValidTokens(
    settings: typeof tolinoSettings.$inferSelect,
  ): Promise<TolinoTokens> {
    // Check if we have tokens and they're not expired
    if (
      settings.accessToken &&
      settings.refreshToken &&
      settings.tokenExpiresAt
    ) {
      // Check if we need to refresh
      if (!tolinoAuthService.shouldRefreshToken(settings.tokenExpiresAt)) {
        return {
          accessToken: settings.accessToken,
          refreshToken: settings.refreshToken,
          expiresIn: Math.floor((settings.tokenExpiresAt - Date.now()) / 1000),
          expiresAt: settings.tokenExpiresAt,
          tokenType: "Bearer",
        };
      }

      // Try to refresh
      try {
        logger.debug(`[Tolino Upload] Refreshing expired token`);
        const newTokens = await tolinoAuthService.refreshToken(
          settings.refreshToken,
          settings.resellerId as ResellerId,
        );

        // Update stored tokens
        await this.updateTokens(settings.userId, newTokens);

        return newTokens;
      } catch {
        logger.warn(`[Tolino Upload] Token refresh failed, will re-login`);
        // Fall through to re-login
      }
    }

    // Need to login fresh - but we need the password which we need to decrypt
    // For now, throw an error asking user to re-authenticate
    throw new Error(
      "Session expired. Please re-enter your Tolino credentials.",
    );
  }

  /**
   * Update stored tokens after refresh
   */
  private async updateTokens(
    userId: string,
    tokens: TolinoTokens,
  ): Promise<void> {
    await db
      .update(tolinoSettings)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(tolinoSettings.userId, userId));
  }
}

// Export singleton instance
export const tolinoUploadService = new TolinoUploadService();
