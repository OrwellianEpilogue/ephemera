import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { logger } from "../utils/logger.js";
import { downloadTracker } from "./download-tracker.js";

const AA_BASE_URL = process.env.AA_BASE_URL;
const TEMP_FOLDER = process.env.DOWNLOAD_FOLDER || "./downloads";
const FLARESOLVERR_URL =
  process.env.FLARESOLVERR_URL || "http://localhost:8191";
const SLOW_DOWNLOAD_TIMEOUT = parseInt(
  process.env.SLOW_DOWNLOAD_TIMEOUT || "300000",
  10,
); // 5 minutes
const MAX_SERVERS = 6; // Anna's Archive has servers 0-5

// FlareSolverr API types
interface FlareSolverrRequest {
  cmd: string;
  url?: string;
  session?: string;
  maxTimeout?: number;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution?: {
    url: string;
    status: number;
    response: string;
    userAgent: string;
  };
  session?: string;
}

export interface SlowDownloadOptions {
  md5: string;
  onProgress?: (info: ProgressInfo) => void;
}

export interface ProgressInfo {
  status: "bypassing_protection" | "waiting_countdown" | "downloading";
  message: string;
  downloaded?: number;
  total?: number;
  speed?: string;
  eta?: number;
}

export interface SlowDownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  serverIndex?: number;
}

export class SlowDownloader {
  /**
   * Download a file using Anna's Archive slow download links
   * Automatically tries servers 0-5 until one succeeds
   */
  async downloadWithRetry(
    md5: string,
    onProgress?: (info: ProgressInfo) => void,
  ): Promise<SlowDownloadResult> {
    const downloadId = Math.random().toString(36).substring(7);
    logger.info(`[${downloadId}] Starting slow download for ${md5}`);

    // Try each server in sequence
    for (let serverIndex = 0; serverIndex < MAX_SERVERS; serverIndex++) {
      try {
        logger.info(`[${downloadId}] Trying server #${serverIndex}...`);

        onProgress?.({
          status: "bypassing_protection",
          message: `Trying slow server #${serverIndex + 1}...`,
        });

        const result = await this.download({
          md5,
          serverIndex,
          downloadId,
          onProgress,
        });

        if (result.success) {
          logger.success(
            `[${downloadId}] Successfully downloaded from server #${serverIndex}`,
          );
          return result;
        }

        logger.warn(
          `[${downloadId}] Server #${serverIndex} failed: ${result.error}`,
        );
      } catch (error: unknown) {
        logger.error(
          `[${downloadId}] Server #${serverIndex} error:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const error = `All ${MAX_SERVERS} slow download servers failed`;
    logger.error(`[${downloadId}] ${error}`);
    return { success: false, error };
  }

  /**
   * Download from a specific slow download server
   */
  private async download(options: {
    md5: string;
    serverIndex: number;
    downloadId: string;
    onProgress?: (info: ProgressInfo) => void;
  }): Promise<SlowDownloadResult> {
    const { md5, serverIndex, onProgress } = options;
    const downloadId = options.downloadId;
    let sessionId: string | null = null;

    try {
      // Ensure temp folder exists
      await mkdir(TEMP_FOLDER, { recursive: true });

      // Create FlareSolverr session
      sessionId = await this.createSession(downloadId);
      logger.info(`[${downloadId}] Created FlareSolverr session: ${sessionId}`);

      // Build slow download URL
      const slowDownloadUrl = `${AA_BASE_URL}/slow_download/${md5}/0/${serverIndex}`;
      logger.info(`[${downloadId}] Requesting: ${slowDownloadUrl}`);

      onProgress?.({
        status: "bypassing_protection",
        message: "Bypassing bot protection...",
      });

      // Request the page through FlareSolverr (this handles bot protection)
      let html = await this.requestPage(slowDownloadUrl, sessionId, downloadId);

      // Extract download URL from HTML
      let downloadUrl = this.extractDownloadUrl(html, downloadId);

      // If no download URL found, check for countdown and wait
      if (!downloadUrl) {
        logger.info(
          `[${downloadId}] Download link not ready, checking for countdown...`,
        );

        // Extract countdown duration from the page
        const countdownSeconds = this.extractCountdownTime(html, downloadId);

        if (countdownSeconds > 0) {
          logger.info(
            `[${downloadId}] Countdown found: ${countdownSeconds} seconds`,
          );

          onProgress?.({
            status: "waiting_countdown",
            message: `Waiting for countdown (${countdownSeconds}s)...`,
          });

          // Wait for the countdown duration + 2 seconds buffer
          await new Promise((resolve) =>
            setTimeout(resolve, (countdownSeconds + 2) * 1000),
          );

          logger.info(
            `[${downloadId}] Countdown complete, requesting page again...`,
          );

          // Request the page again - the download link should now be available
          html = await this.requestPage(slowDownloadUrl, sessionId, downloadId);
          downloadUrl = this.extractDownloadUrl(html, downloadId);

          if (!downloadUrl) {
            throw new Error("Could not find download link after countdown");
          }
        } else {
          throw new Error(
            "Could not find download link or countdown timer on page",
          );
        }
      }

      logger.info(
        `[${downloadId}] Found download URL: ${downloadUrl.substring(0, 100)}...`,
      );

      // Download the actual file
      const filePath = await this.downloadFile(
        downloadUrl,
        md5,
        downloadId,
        onProgress,
      );

      logger.success(`[${downloadId}] Download completed: ${filePath}`);

      return {
        success: true,
        filePath,
        serverIndex,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${downloadId}] Download failed:`, errorMsg);
      return {
        success: false,
        error: errorMsg,
        serverIndex,
      };
    } finally {
      // Clean up session
      if (sessionId) {
        await this.destroySession(sessionId, downloadId);
      }
    }
  }

  /**
   * Create a FlareSolverr session
   */
  private async createSession(_downloadId: string): Promise<string> {
    const response = await this.flaresolverrRequest({
      cmd: "sessions.create",
    });

    if (response.status !== "ok" || !response.session) {
      throw new Error(
        `Failed to create FlareSolverr session: ${response.message}`,
      );
    }

    return response.session;
  }

  /**
   * Request a page through FlareSolverr
   * This handles DDoS protection, Cloudflare, and countdown timers
   */
  private async requestPage(
    url: string,
    sessionId: string,
    downloadId: string,
  ): Promise<string> {
    logger.info(`[${downloadId}] Requesting page through FlareSolverr...`);

    const response = await this.flaresolverrRequest({
      cmd: "request.get",
      url,
      session: sessionId,
      maxTimeout: SLOW_DOWNLOAD_TIMEOUT,
    });

    if (response.status !== "ok" || !response.solution) {
      throw new Error(`FlareSolverr request failed: ${response.message}`);
    }

    const { solution } = response;

    // Check for bot protection
    if (solution.status === 403) {
      logger.warn(`[${downloadId}] Got 403 status, page may be protected`);
    }

    // Check if we got HTML
    if (!solution.response) {
      throw new Error("No HTML response from FlareSolverr");
    }

    logger.info(
      `[${downloadId}] Got HTML response (${solution.response.length} chars)`,
    );
    logger.debug(`[${downloadId}] Page status: ${solution.status}`);

    return solution.response;
  }

  /**
   * Extract download URL from the slow download page HTML
   */
  private extractDownloadUrl(html: string, downloadId: string): string | null {
    // Anna's Archive shows the download URL in several places after countdown completes:
    // 1. In a button's onclick with navigator.clipboard.writeText('URL')
    // 2. In a span with the URL as text content

    const patterns = [
      // navigator.clipboard.writeText('http://...')
      /navigator\.clipboard\.writeText\(['"]([^'"]+)['"]/i,
      // <span class="...">http://...</span> (URL in text content)
      /<span[^>]*class=["'][^"']*whitespace-normal[^"']*["'][^>]*>(https?:\/\/[^<]+)<\/span>/i,
      // Generic download link patterns
      /<a[^>]*href=["']([^"']*)"[^>]*download[^>]*>/i,
      /<a[^>]*download[^>]*href=["']([^"']*)"[^>]*>/i,
      /window\.location\.href\s*=\s*["']([^"']*)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let url = match[1];

        // Decode HTML entities if present
        url = url
          .replace(/&gt;/g, ">")
          .replace(/&lt;/g, "<")
          .replace(/&amp;/g, "&");

        // Validate URL looks like a download link
        if (url.startsWith("http") && !url.includes("slow_download")) {
          logger.info(
            `[${downloadId}] Found download URL using pattern: ${pattern.source.substring(0, 50)}...`,
          );
          return url;
        }
      }
    }

    // If no match, log some debug info
    logger.debug(`[${downloadId}] HTML snippet: ${html.substring(0, 500)}`);
    logger.warn(`[${downloadId}] No download URL found in HTML`);

    return null;
  }

  /**
   * Extract countdown timer duration from the slow download page HTML
   * Returns the number of seconds to wait, or 0 if not found
   */
  private extractCountdownTime(html: string, downloadId: string): number {
    // Anna's Archive uses: <span class="js-partner-countdown">45</span>
    const patterns = [
      // <span class="js-partner-countdown">45</span>
      /<span[^>]*class=["'][^"']*js-partner-countdown[^"']*["'][^>]*>(\d+)<\/span>/i,
      // Generic patterns as fallback
      /<[^>]*(?:id|class)=["'][^"']*(?:timer|countdown)[^"']*["'][^>]*>(\d+)<\/span>/i,
      /data-countdown=["'](\d+)["']/i,
      /countdown:\s*(\d+)/i,
      /(?:var|let|const)\s+countdown\s*=\s*(\d+)/i,
      /countdownSeconds\s*=\s*(\d+)/i,
      /["']countdown[_-]?seconds["']\s*:\s*(\d+)/i,
      /wait\s+(\d+)\s+seconds/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const seconds = parseInt(match[1], 10);
        if (seconds > 0 && seconds < 300) {
          // Reasonable range: 1-300 seconds
          logger.info(
            `[${downloadId}] Found countdown: ${seconds}s using pattern: ${pattern.source.substring(0, 50)}...`,
          );
          return seconds;
        }
      }
    }

    // If no countdown found, log some context
    logger.debug(`[${downloadId}] HTML length: ${html.length} chars`);
    logger.warn(`[${downloadId}] No countdown timer found in HTML`);

    return 0;
  }

  /**
   * Download the actual file from the extracted URL
   */
  private async downloadFile(
    downloadUrl: string,
    md5: string,
    downloadId: string,
    onProgress?: (info: ProgressInfo) => void,
  ): Promise<string> {
    logger.info(`[${downloadId}] Starting file download...`);

    // Fetch the file
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SLOW_DOWNLOAD_TIMEOUT);

    const response = await fetch(downloadUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get file info
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
    );
    const contentDisposition = response.headers.get("content-disposition");

    let filename = `${md5}.bin`;

    // Try to extract filename from URL
    try {
      const url = new URL(downloadUrl);
      const pathname = decodeURIComponent(url.pathname);
      const pathSegments = pathname.split("/");
      const lastSegment = pathSegments[pathSegments.length - 1];

      if (lastSegment && lastSegment.includes(".")) {
        const extMatch = lastSegment.match(/\.([^.]+)$/);
        const extension = extMatch ? extMatch[1] : "bin";
        let baseName = lastSegment.substring(0, lastSegment.lastIndexOf("."));

        // Clean AA format: "Title -- Author -- Publisher..."
        const parts = baseName.split(" -- ").map((p) => p.trim());
        if (parts.length >= 2) {
          baseName = `${parts[0]} - ${parts[1]}`;
        }

        // Remove invalid characters
        baseName = baseName
          .replace(/[<>:"/\\|?*]/g, "")
          .replace(/©/g, "")
          .replace(/\s+/g, " ")
          .trim();

        // Limit length
        if (baseName.length > 200) {
          baseName = baseName.substring(0, 200).trim();
        }

        filename = `${baseName}.${extension}`;
        logger.info(`[${downloadId}] Extracted filename: ${filename}`);
      }
    } catch (_e) {
      logger.warn(`[${downloadId}] Could not extract filename from URL`);
    }

    // Try Content-Disposition if still default
    if (filename === `${md5}.bin` && contentDisposition) {
      const filenameMatch = contentDisposition.match(
        /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
      );
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, "");
        logger.info(
          `[${downloadId}] Filename from Content-Disposition: ${filename}`,
        );
      }
    }

    const filePath = join(TEMP_FOLDER, filename);
    logger.info(`[${downloadId}] Saving to: ${filePath}`);

    // Mark as started in DB
    await downloadTracker.markStarted(md5, filePath);

    // Stream to file with progress tracking
    const fileStream = createWriteStream(filePath);
    let downloadedBytes = 0;
    let lastUpdate = Date.now();
    let lastBytes = 0;

    if (!response.body) {
      throw new Error("No response body");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readable = Readable.fromWeb(response.body as any);

    readable.on("data", (chunk: Buffer) => {
      downloadedBytes += chunk.length;

      // Update progress every 500ms
      const now = Date.now();
      if (now - lastUpdate >= 500) {
        const duration = (now - lastUpdate) / 1000;
        const bytesInPeriod = downloadedBytes - lastBytes;
        const speed = bytesInPeriod / duration;
        const remaining = contentLength - downloadedBytes;
        const eta = remaining / speed;

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
        onProgress?.({
          status: "downloading",
          message: `Downloading... ${Math.round((downloadedBytes / contentLength) * 100)}%`,
          downloaded: downloadedBytes,
          total: contentLength,
          speed: speedStr,
          eta: Math.ceil(eta),
        });

        lastUpdate = now;
        lastBytes = downloadedBytes;
      }
    });

    await pipeline(readable, fileStream);

    logger.success(`[${downloadId}] File saved: ${filePath}`);

    // Mark as completed
    await downloadTracker.markCompleted(md5);

    return filePath;
  }

  /**
   * Destroy a FlareSolverr session
   */
  private async destroySession(
    sessionId: string,
    downloadId: string,
  ): Promise<void> {
    try {
      await this.flaresolverrRequest({
        cmd: "sessions.destroy",
        session: sessionId,
      });
      logger.info(
        `[${downloadId}] Destroyed FlareSolverr session: ${sessionId}`,
      );
    } catch (error: unknown) {
      logger.warn(
        `[${downloadId}] Failed to destroy session:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Make a request to FlareSolverr API
   */
  private async flaresolverrRequest(
    request: FlareSolverrRequest,
  ): Promise<FlareSolverrResponse> {
    const url = `${FLARESOLVERR_URL}/v1`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(
          `FlareSolverr HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as FlareSolverrResponse;
      return data;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("FlareSolverr request failed:", errorMsg);
      throw new Error(
        `FlareSolverr unavailable: ${errorMsg}. Make sure FlareSolverr is running at ${FLARESOLVERR_URL}`,
      );
    }
  }

  /**
   * Format download speed for display
   */
  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(0)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    } else {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
    }
  }
}

export const slowDownloader = new SlowDownloader();
