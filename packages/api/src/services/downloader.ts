import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { logger } from "../utils/logger.js";
import { downloadTracker } from "./download-tracker.js";
import { slowDownloader } from "./slow-downloader.js";

const AA_API_KEY = process.env.AA_API_KEY;
const AA_BASE_URL = process.env.AA_BASE_URL;
const TEMP_FOLDER = process.env.DOWNLOAD_FOLDER || "./downloads";
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || "30000");

export interface DownloadOptions {
  md5: string;
  pathIndex?: number;
  domainIndex?: number;
  onProgress?: (
    downloaded: number,
    total: number,
    speed: string,
    eta: number,
  ) => void;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  isQuotaError?: boolean;
}

export interface AAResponse {
  download_url: string | null;
  error?: string;
  account_fast_download_info?: {
    downloads_left: number;
    downloads_per_day: number;
    recently_downloaded_md5s: string[];
  };
}

export class Downloader {
  async getDownloadUrl(
    md5: string,
    pathIndex?: number,
    domainIndex?: number,
  ): Promise<AAResponse> {
    if (!AA_API_KEY) {
      throw new Error("AA_API_KEY is not set");
    }

    const params = new URLSearchParams({
      md5,
      key: AA_API_KEY,
    });

    if (pathIndex !== undefined) {
      params.append("path_index", pathIndex.toString());
    }

    if (domainIndex !== undefined) {
      params.append("domain_index", domainIndex.toString());
    }

    const url = `${AA_BASE_URL}/dyn/api/fast_download.json?${params.toString()}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();

      return data as AAResponse;
    } catch (error: unknown) {
      logger.error(`Failed to get download URL for ${md5}:`, error);
      return {
        download_url: null,
        error:
          error instanceof Error ? error.message : "Failed to get download URL",
      };
    }
  }

  async download(options: DownloadOptions): Promise<DownloadResult> {
    const { md5, pathIndex, domainIndex, onProgress } = options;

    try {
      // Ensure temp folder exists
      await mkdir(TEMP_FOLDER, { recursive: true });

      // Check if API key is available - if not, use slow download
      if (!AA_API_KEY) {
        logger.info(
          `No AA_API_KEY configured - using slow download fallback for ${md5}`,
        );
        return await this.downloadViaSlowServer(md5, onProgress);
      }

      // Get download URL from AA API
      logger.info(`Getting download URL for ${md5}...`);
      const apiResponse = await this.getDownloadUrl(
        md5,
        pathIndex,
        domainIndex,
      );

      // Debug: Log the full API response
      logger.info(`API Response:`, JSON.stringify(apiResponse, null, 2));

      // Check and store quota information if available
      if (apiResponse.account_fast_download_info) {
        const quota = apiResponse.account_fast_download_info;
        logger.info("Found quota info in API response");

        // Store quota info in database
        await downloadTracker.update(md5, {
          downloadsLeft: quota.downloads_left,
          downloadsPerDay: quota.downloads_per_day,
          quotaCheckedAt: Date.now(),
        });

        logger.info(
          `Quota: ${quota.downloads_left}/${quota.downloads_per_day} downloads remaining`,
        );

        // Check if quota is exhausted - fall back to slow download
        if (quota.downloads_left === 0) {
          logger.warn(
            `Quota exhausted (0/${quota.downloads_per_day} downloads remaining) - falling back to slow download for ${md5}`,
          );
          return await this.downloadViaSlowServer(md5, onProgress);
        }
      } else {
        logger.warn("No quota info in API response, will check error message");
      }

      if (!apiResponse.download_url || apiResponse.error) {
        const error = apiResponse.error || "No download URL available";
        logger.error(`Failed to get download URL: ${error}`);

        // Check if error message indicates quota exhaustion
        const quotaErrorPatterns = [
          "no downloads left",
          "quota exhausted",
          "download limit",
          "downloads remaining: 0",
        ];
        const isQuotaError = quotaErrorPatterns.some((pattern) =>
          error.toLowerCase().includes(pattern),
        );

        if (isQuotaError) {
          logger.warn(
            "Detected quota error from error message - falling back to slow download",
          );
          return await this.downloadViaSlowServer(md5, onProgress);
        }

        return { success: false, error };
      }

      const downloadUrl = apiResponse.download_url;
      logger.info(`Starting download from: ${downloadUrl}`);

      // Start download
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT * 10,
      ); // 5 minutes for download

      const response = await fetch(downloadUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = `HTTP ${response.status}: ${response.statusText}`;
        logger.error(`Download failed: ${error}`);
        return { success: false, error };
      }

      // Get file info
      const contentLength = parseInt(
        response.headers.get("content-length") || "0",
      );
      const contentDisposition = response.headers.get("content-disposition");

      let filename = `${md5}.bin`;

      // Try to extract filename from URL path (AA includes it there)
      try {
        const url = new URL(downloadUrl);
        const pathname = decodeURIComponent(url.pathname);
        const pathSegments = pathname.split("/");
        const lastSegment = pathSegments[pathSegments.length - 1];

        // Check if the last segment looks like a filename (has an extension)
        if (lastSegment && lastSegment.includes(".")) {
          // Extract extension first
          const extMatch = lastSegment.match(/\.([^.]+)$/);
          const extension = extMatch ? extMatch[1] : "bin";

          // Get base filename without extension
          let baseName = lastSegment.substring(0, lastSegment.lastIndexOf("."));

          // Clean up AA format: "Title -- Author -- Publisher -- ISBN -- MD5 -- AA"
          // We only want the title and author (first 2 parts)
          const parts = baseName.split(" -- ").map((p) => p.trim());
          if (parts.length >= 2) {
            // Take title and author only
            baseName = `${parts[0]} - ${parts[1]}`;
          }

          // Remove problematic characters
          baseName = baseName
            .replace(/[<>:"/\\|?*]/g, "") // Invalid filename characters
            .replace(/©/g, "") // Copyright symbol
            .replace(/\s+/g, " ") // Multiple spaces to single space
            .trim();

          // Limit length (max 200 chars for the base name)
          if (baseName.length > 200) {
            baseName = baseName.substring(0, 200).trim();
          }

          filename = `${baseName}.${extension}`;
          logger.info(`Cleaned filename from URL: ${filename}`);
        }
      } catch (_e) {
        logger.warn("Could not extract filename from URL");
      }

      // If still default, try Content-Disposition header
      if (filename === `${md5}.bin` && contentDisposition) {
        logger.info(`Content-Disposition header: ${contentDisposition}`);
        const filenameMatch = contentDisposition.match(
          /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
        );
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, "");
          logger.info(
            `Extracted filename from Content-Disposition: ${filename}`,
          );
        }
      }

      // Last resort: try to get extension from URL
      if (filename === `${md5}.bin` && downloadUrl.includes(".")) {
        const urlParts = downloadUrl.split(".");
        const ext = urlParts[urlParts.length - 1].split("?")[0];
        if (ext && ext.length <= 5) {
          // reasonable extension length
          filename = `${md5}.${ext}`;
          logger.info(`Using extension from URL: ${ext}`);
        }
      }

      logger.info(`Final filename: ${filename}`);
      const filePath = join(TEMP_FOLDER, filename);

      // Mark as started in DB
      await downloadTracker.markStarted(md5, filePath);

      // Stream to file with progress tracking
      const fileStream = createWriteStream(filePath);
      let downloadedBytes = 0;
      let lastUpdate = Date.now();
      let lastBytes = 0;

      if (!response.body) {
        return { success: false, error: "No response body" };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readable = Readable.fromWeb(response.body as any);

      readable.on("data", (chunk: Buffer) => {
        downloadedBytes += chunk.length;

        // Update progress every 500ms
        const now = Date.now();
        if (now - lastUpdate >= 500) {
          const duration = (now - lastUpdate) / 1000; // seconds
          const bytesInPeriod = downloadedBytes - lastBytes;
          const speed = bytesInPeriod / duration; // bytes per second
          const remaining = contentLength - downloadedBytes;
          const eta = remaining / speed; // seconds

          const speedStr = this.formatSpeed(speed);

          // Update database
          downloadTracker.updateProgress(
            md5,
            downloadedBytes,
            contentLength,
            speedStr,
            Math.ceil(eta),
          );

          // Call progress callback
          if (onProgress) {
            onProgress(
              downloadedBytes,
              contentLength,
              speedStr,
              Math.ceil(eta),
            );
          }

          lastUpdate = now;
          lastBytes = downloadedBytes;
        }
      });

      await pipeline(readable, fileStream);

      logger.success(`Download completed: ${filePath}`);

      // Mark as completed
      await downloadTracker.markCompleted(md5);

      return { success: true, filePath };
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown download error";
      logger.error(`Download failed for ${md5}:`, errorMsg);

      await downloadTracker.markError(md5, errorMsg);

      return { success: false, error: errorMsg };
    }
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(0)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    } else {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    }
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  }

  /**
   * Download via slow download servers as fallback
   * Used when API key is missing or quota exhausted
   */
  private async downloadViaSlowServer(
    md5: string,
    onProgress?: (
      downloaded: number,
      total: number,
      speed: string,
      eta: number,
    ) => void,
  ): Promise<DownloadResult> {
    logger.info(`Using slow download fallback for ${md5}`);

    try {
      // Use slow downloader with progress mapping
      const result = await slowDownloader.downloadWithRetry(
        md5,
        (progressInfo) => {
          // Map slow download progress to the format expected by onProgress callback
          if (
            progressInfo.status === "downloading" &&
            onProgress &&
            progressInfo.downloaded &&
            progressInfo.total
          ) {
            onProgress(
              progressInfo.downloaded,
              progressInfo.total,
              progressInfo.speed || "0 B/s",
              progressInfo.eta || 0,
            );
          }
        },
      );

      if (result.success && result.filePath) {
        return { success: true, filePath: result.filePath };
      } else {
        return {
          success: false,
          error: result.error || "Slow download failed",
        };
      }
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : "Slow download error";
      logger.error(`Slow download failed for ${md5}:`, errorMsg);
      await downloadTracker.markError(md5, errorMsg);
      return { success: false, error: errorMsg };
    }
  }
}

export const downloader = new Downloader();
