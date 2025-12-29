import { mkdir, writeFile, access } from "fs/promises";
import { join, extname } from "path";
import { createHash } from "crypto";
import { appConfigService } from "./app-config.js";
import { logger } from "../utils/logger.js";

const COVERS_SUBFOLDER = "covers";

/**
 * Cover Downloader Service
 * Downloads book cover images from source URLs and stores them locally
 */
class CoverDownloaderService {
  /**
   * Download a cover image and store it locally
   * @param coverUrl URL of the cover image to download
   * @param bookHash Unique identifier for the book (used in filename)
   * @returns Local file path or null if download failed
   */
  async downloadCover(
    coverUrl: string,
    bookHash: string,
  ): Promise<string | null> {
    try {
      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(coverUrl);
      } catch {
        logger.warn(`[CoverDownloader] Invalid URL: ${coverUrl}`);
        return null;
      }

      // Get download folder and create covers directory
      const downloadFolder = await appConfigService.getDownloadFolder();
      const coversDir = join(downloadFolder, COVERS_SUBFOLDER);

      // Ensure covers directory exists
      await mkdir(coversDir, { recursive: true });

      // Generate filename: {sanitizedHash}_{urlHash}.{ext}
      // We hash the URL to handle duplicate downloads gracefully
      const urlHash = createHash("md5")
        .update(coverUrl)
        .digest("hex")
        .slice(0, 8);
      const sanitizedHash = this.sanitizeFilename(bookHash);
      const ext = this.getExtension(parsedUrl.pathname);
      const filename = `${sanitizedHash}_${urlHash}${ext}`;
      const filePath = join(coversDir, filename);

      // Check if already downloaded
      try {
        await access(filePath);
        logger.debug(`[CoverDownloader] Cover already exists: ${filePath}`);
        return filePath;
      } catch {
        // File doesn't exist, proceed with download
      }

      // Download image
      logger.debug(`[CoverDownloader] Downloading: ${coverUrl}`);
      const response = await fetch(coverUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BookDownloader/1.0)",
          Accept: "image/*",
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        logger.warn(
          `[CoverDownloader] Failed to download: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      // Validate content type
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        logger.warn(`[CoverDownloader] Invalid content type: ${contentType}`);
        return null;
      }

      // Write file
      const buffer = await response.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));

      logger.info(`[CoverDownloader] Saved cover: ${filename}`);
      return filePath;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        logger.warn(`[CoverDownloader] Download timeout for: ${coverUrl}`);
      } else {
        logger.error("[CoverDownloader] Error:", error);
      }
      return null;
    }
  }

  /**
   * Get the covers directory path
   */
  async getCoversDirectory(): Promise<string> {
    const downloadFolder = await appConfigService.getDownloadFolder();
    return join(downloadFolder, COVERS_SUBFOLDER);
  }

  /**
   * Sanitize a string for use as a filename
   * Removes or replaces characters that are unsafe for filenames
   */
  private sanitizeFilename(str: string): string {
    return (
      str
        // Replace colons with underscores (from prefixed hashes like "goodreads:123")
        .replace(/:/g, "_")
        // Remove or replace other unsafe characters
        .replace(/[<>:"/\\|?*]/g, "_")
        // Collapse multiple underscores
        .replace(/_+/g, "_")
        // Limit length
        .slice(0, 100)
    );
  }

  /**
   * Extract file extension from URL path
   * Defaults to .jpg if no valid extension found
   */
  private getExtension(urlPath: string): string {
    const ext = extname(urlPath).toLowerCase();

    // Valid image extensions
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
      return ext;
    }

    // Default to .jpg for unknown extensions
    return ".jpg";
  }
}

// Export singleton instance
export const coverDownloader = new CoverDownloaderService();
