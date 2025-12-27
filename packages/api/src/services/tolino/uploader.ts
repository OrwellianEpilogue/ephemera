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
}

export interface UploadResult {
  success: boolean;
  message: string;
  uploadedAt?: number;
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

      // 3. Check if file exists
      const filePath = download.tempPath || download.finalPath;
      if (!filePath || !existsSync(filePath)) {
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
        await this.uploadCover(client, uploadResult.inventoryUuid, md5);
      }

      // 8. Cleanup temp converted file
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
        message: "Book uploaded successfully",
        uploadedAt: Date.now(),
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
   */
  private async uploadCover(
    client: TolinoApiClient,
    inventoryUuid: string,
    md5: string,
  ): Promise<void> {
    try {
      // Get book info to find cover URL
      const book = await bookService.getBook(md5);
      if (!book?.coverUrl) {
        logger.debug(`[Tolino Upload] No cover URL for book ${md5}`);
        return;
      }

      // Download cover to temp file
      const coverPath = await this.downloadCover(book.coverUrl, md5);
      if (!coverPath) {
        return;
      }

      // Upload cover
      const result = await client.uploadCover(inventoryUuid, coverPath);
      if (!result.success) {
        logger.warn(`[Tolino Upload] Cover upload failed: ${result.error}`);
      }

      // Cleanup temp cover file
      try {
        await unlink(coverPath);
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      logger.warn(`[Tolino Upload] Cover processing error:`, error);
      // Cover upload errors are non-blocking
    }
  }

  /**
   * Download cover image to temp file
   */
  private async downloadCover(
    coverUrl: string,
    md5: string,
  ): Promise<string | null> {
    try {
      const response = await fetch(coverUrl);
      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      const ext = contentType.includes("png") ? "png" : "jpg";
      const tempDir = process.env.DOWNLOAD_FOLDER || "./downloads";
      const coverPath = join(tempDir, `${md5}_cover.${ext}`);

      const buffer = await response.arrayBuffer();
      const { writeFile } = await import("fs/promises");
      await writeFile(coverPath, Buffer.from(buffer));

      return coverPath;
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

    const filePath = download.tempPath || download.finalPath;
    if (!filePath || !existsSync(filePath)) {
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
