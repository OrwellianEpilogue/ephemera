import type { Download, Book } from "../db/schema.js";
import { downloadTracker } from "./download-tracker.js";
import { bookService } from "./book-service.js";
import { indexerSettingsService } from "./indexer-settings.js";
import { join } from "path";

/**
 * Service to map internal queue/downloads to SABnzbd API format
 */
export class SabnzbdMapper {
  /**
   * Map download status to SABnzbd queue status
   * Note: SABnzbd doesn't use "Queued" - waiting items show as "Downloading" with 0%
   */
  private mapQueueStatus(status: Download["status"]): string {
    switch (status) {
      case "queued":
        return "Downloading"; // SABnzbd shows waiting items as "Downloading"
      case "downloading":
        return "Downloading";
      case "delayed":
        return "Paused";
      default:
        return "Downloading"; // Default for queue items
    }
  }

  /**
   * Map download status to SABnzbd history status
   */
  private mapHistoryStatus(status: Download["status"]): string {
    switch (status) {
      case "queued":
        return "Grabbing"; // Active item waiting to start
      case "downloading":
        return "Downloading";
      case "delayed":
        return "Paused";
      case "done":
      case "available":
        return "Completed";
      case "error":
      case "cancelled":
        return "Failed"; // Both error and cancelled show as Failed in SABnzbd
      default:
        return "Unknown";
    }
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Format bytes per second to human-readable speed
   */
  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return (
      parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
    );
  }

  /**
   * Format ETA seconds to human-readable time
   */
  private formatEta(seconds: number | null): string {
    if (!seconds || seconds <= 0) return "0:00:00";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60); // Round down seconds

    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Build full name with metadata in a format Readarr can parse
   */
  private buildFullName(download: Download, book?: Book | null): string {
    // Use book metadata if available, otherwise fall back to download metadata
    const author = book?.authors ? book.authors.join(", ") : download.author;
    const title = book?.title || download.title;
    const format = book?.format || download.format;
    const year = book?.year || download.year;

    // Use a simpler format that Readarr can parse: "Author - Title (format)"
    // This mimics common ebook release naming conventions
    let fullName = "";

    if (author && title) {
      fullName = `${author} - ${title}`;
    } else if (title) {
      fullName = title;
    }

    // Add year if available (helps with disambiguation)
    if (year) {
      fullName += ` (${year})`;
    }

    // Add format in parentheses at the end (common ebook naming pattern)
    if (format) {
      fullName += ` (${format.toLowerCase()})`;
    }

    return fullName || "Unknown Book";
  }

  /**
   * Map a download to SABnzbd queue slot format with book metadata
   */
  downloadToQueueSlot(
    download: Download,
    book?: Book | null,
    index: number = 0,
  ): Record<string, unknown> {
    const size = download.size || 0;
    const downloaded = download.downloadedBytes || 0;
    const sizeleft = Math.max(0, size - downloaded);
    const percentage = size > 0 ? Math.round((downloaded / size) * 100) : 0;

    const fullName = this.buildFullName(download, book);

    // Calculate ETA/timeleft
    let etaSeconds = 0;

    // First check if we have a countdown timer (for slow downloads)
    if (download.countdownStartedAt && download.countdownSeconds) {
      const elapsed = Date.now() - download.countdownStartedAt;
      const remaining =
        Math.max(0, download.countdownSeconds * 1000 - elapsed) / 1000;
      etaSeconds = Math.round(remaining);
    }
    // Use the stored ETA if available
    else if (download.eta && download.eta > 0) {
      etaSeconds = download.eta;
    }
    // Try to calculate based on speed if we're downloading
    else if (
      download.status === "downloading" &&
      download.speed &&
      sizeleft > 0
    ) {
      // Parse speed string (e.g., "2.5 MB/s" -> bytes per second)
      const speedMatch = download.speed.match(/^([\d.]+)\s*(KB|MB|GB)\/s$/i);
      if (speedMatch) {
        const value = parseFloat(speedMatch[1]);
        const unit = speedMatch[2].toUpperCase();
        let bytesPerSecond = value;
        if (unit === "KB") bytesPerSecond *= 1024;
        else if (unit === "MB") bytesPerSecond *= 1024 * 1024;
        else if (unit === "GB") bytesPerSecond *= 1024 * 1024 * 1024;

        if (bytesPerSecond > 0) {
          etaSeconds = Math.round(sizeleft / bytesPerSecond);
        }
      }
    }

    return {
      index: index,
      nzo_id: `SABnzbd_nzo_${download.md5.substring(0, 8)}`,
      unpackopts: "3",
      priority: "Normal",
      script: "None",
      filename: fullName,
      labels: [],
      password: "",
      cat: "ephemera",
      mbleft: (sizeleft / (1024 * 1024)).toFixed(2),
      mb: (size / (1024 * 1024)).toFixed(2),
      size: this.formatBytes(size),
      sizeleft: this.formatBytes(sizeleft),
      percentage: percentage.toString(),
      mbmissing: "0.00",
      direct_unpack: null,
      status: this.mapQueueStatus(download.status),
      timeleft: this.formatEta(etaSeconds),
      avg_age: "0d",
      time_added: Math.floor((download.queuedAt || Date.now()) / 1000),
    };
  }

  /**
   * Map a completed/failed download to SABnzbd history slot format
   */
  async downloadToHistorySlot(
    download: Download,
    book?: Book | null,
  ): Promise<Record<string, unknown>> {
    const size = download.size || 0;
    const downloadedBytes = download.downloadedBytes || 0;

    // Only set completed timestamp for actually completed downloads
    const isCompleted =
      download.status === "done" ||
      download.status === "available" ||
      download.status === "error" ||
      download.status === "cancelled";
    const completed = isCompleted
      ? download.completedAt || download.startedAt || download.queuedAt
      : 0;

    const downloadTime =
      download.completedAt && download.startedAt
        ? Math.round((download.completedAt - download.startedAt) / 1000)
        : 0;

    const fullName = this.buildFullName(download, book);

    // Map status for history items
    const historyStatus = this.mapHistoryStatus(download.status);

    // Get indexer settings for real paths
    const indexerSettings = await indexerSettingsService.getSettings();

    // Determine storage path based on final path or configured directory
    let storagePath = download.finalPath;
    if (!storagePath) {
      // If no final path, build the expected path based on configuration
      if (indexerSettings.indexerCategoryDir) {
        storagePath = join(
          indexerSettings.indexerCompletedDir,
          "ephemera",
          fullName,
        );
      } else {
        storagePath = join(indexerSettings.indexerCompletedDir, fullName);
      }
    }

    // Build temporary path
    const tempPath =
      download.tempPath || join(indexerSettings.indexerIncompleteDir, fullName);

    return {
      completed: completed ? Math.floor(completed / 1000) : 0, // Unix timestamp in seconds, 0 for active
      name: fullName,
      nzb_name: `${fullName}.nzb`,
      category: "ephemera",
      pp: "D", // Download only
      script: "None",
      report: "",
      url: null,
      status: historyStatus,
      nzo_id: `SABnzbd_nzo_${download.md5.substring(0, 8)}`,
      storage: storagePath,
      path: tempPath,
      script_line: "",
      download_time: downloadTime,
      postproc_time: 0,
      stage_log: [],
      downloaded: downloadedBytes, // Use actual downloaded bytes, not full size
      completeness: null,
      fail_message: download.error || "",
      url_info: "",
      bytes: size, // Always show the total file size
      meta: null,
      series: null,
      md5sum: download.md5,
      password: null,
      duplicate_key: download.title.toLowerCase().replace(/[^a-z0-9]/g, " "),
      archive: false,
      time_added: Math.floor((download.queuedAt || Date.now()) / 1000),
      size: this.formatBytes(size),
      action_line: "",
      loaded: false,
      retry: false,
    };
  }

  /**
   * Format queue response for SABnzbd API
   */
  async formatQueueResponse(
    outputMode: "json" | "xml" = "json",
  ): Promise<Record<string, unknown> | string> {
    // Get active downloads (queued, downloading, delayed)
    let activeDownloads = await downloadTracker.getByStatuses([
      "queued",
      "downloading",
      "delayed",
    ]);

    // Check if indexer-only mode is enabled
    const settings = await indexerSettingsService.getSettings();
    if (settings.indexerOnlyMode) {
      // Filter to only show indexer-initiated downloads
      activeDownloads = activeDownloads.filter(
        (d) => d.downloadSource === "indexer",
      );
    }

    console.log(
      `SABnzbd queue: Found ${activeDownloads.length} active downloads with statuses:`,
      activeDownloads.map((d) => ({
        md5: d.md5,
        title: d.title,
        status: d.status,
      })),
    );

    // Fetch book metadata for all downloads
    const md5s = activeDownloads.map((d) => d.md5);
    const books = await bookService.getBooksByMd5s(md5s);
    const booksMap = new Map(books.map((b) => [b.md5, b]));

    const slots = activeDownloads.map((d: Download, index: number) =>
      this.downloadToQueueSlot(d, booksMap.get(d.md5), index),
    );

    // Calculate totals
    const totalSize = activeDownloads.reduce(
      (sum: number, d: Download) => sum + (d.size || 0),
      0,
    );
    const totalDownloaded = activeDownloads.reduce(
      (sum: number, d: Download) => sum + (d.downloadedBytes || 0),
      0,
    );
    const totalLeft = totalSize - totalDownloaded;

    // Calculate actual speed from downloading items
    const downloading = activeDownloads.filter(
      (d: Download) => d.status === "downloading",
    );
    const paused = activeDownloads.filter(
      (d: Download) => d.status === "delayed",
    );

    // Sum up speed from all downloading items
    let totalBytesPerSecond = 0;
    for (const dl of downloading) {
      if (dl.speed) {
        const speedMatch = dl.speed.match(/^([\d.]+)\s*(KB|MB|GB)\/s$/i);
        if (speedMatch) {
          const value = parseFloat(speedMatch[1]);
          const unit = speedMatch[2].toUpperCase();
          let bps = value;
          if (unit === "KB") bps *= 1024;
          else if (unit === "MB") bps *= 1024 * 1024;
          else if (unit === "GB") bps *= 1024 * 1024 * 1024;
          else bps *= 1; // Assume bytes if no unit
          totalBytesPerSecond += bps;
        }
      }
    }

    // Format speed for display
    const kbpersec = Math.round(totalBytesPerSecond / 1024);
    const speed =
      totalBytesPerSecond > 0 ? this.formatSpeed(totalBytesPerSecond) : "0 B/s";

    // Determine overall queue status
    let queueStatus = "Idle";
    if (downloading.length > 0) {
      queueStatus = "Downloading";
    } else if (paused.length > 0) {
      queueStatus = "Paused";
    } else if (activeDownloads.length > 0) {
      // If we have queued items but nothing downloading yet
      queueStatus = "Downloading"; // SABnzbd shows "Downloading" even for queued items
    }

    // Calculate overall timeleft by summing all active download ETAs
    let totalEta = 0;
    for (const download of activeDownloads) {
      if (download.status === "downloading" || download.status === "queued") {
        // Check for countdown timer first
        if (download.countdownStartedAt && download.countdownSeconds) {
          const elapsed = Date.now() - download.countdownStartedAt;
          const remaining =
            Math.max(0, download.countdownSeconds * 1000 - elapsed) / 1000;
          totalEta += Math.round(remaining);
        }
        // Use stored ETA
        else if (download.eta && download.eta > 0) {
          totalEta += download.eta;
        }
        // Calculate from speed if available
        else if (
          download.status === "downloading" &&
          download.speed &&
          download.size
        ) {
          const sizeleft = Math.max(
            0,
            (download.size || 0) - (download.downloadedBytes || 0),
          );
          const speedMatch = download.speed.match(
            /^([\d.]+)\s*(KB|MB|GB)\/s$/i,
          );
          if (speedMatch && sizeleft > 0) {
            const value = parseFloat(speedMatch[1]);
            const unit = speedMatch[2].toUpperCase();
            let bytesPerSecond = value;
            if (unit === "KB") bytesPerSecond *= 1024;
            else if (unit === "MB") bytesPerSecond *= 1024 * 1024;
            else if (unit === "GB") bytesPerSecond *= 1024 * 1024 * 1024;

            if (bytesPerSecond > 0) {
              totalEta += Math.round(sizeleft / bytesPerSecond);
            }
          }
        }
      }
    }

    const response = {
      queue: {
        version: "4.3.3",
        paused: paused.length > 0 && downloading.length === 0,
        pause_int: "0",
        paused_all: false,
        diskspace1: "8000.0",
        diskspace2: "8000.0",
        diskspace1_norm: "8.0 TB",
        diskspace2_norm: "8.0 TB",
        diskspacetotal1: "10000.0",
        diskspacetotal2: "10000.0",
        speedlimit: "0",
        speedlimit_abs: "0",
        have_warnings: "0",
        finishaction: null,
        quota: "0 B",
        have_quota: false,
        left_quota: "0 B",
        cache_art: "0",
        cache_size: "0 B",
        kbpersec: kbpersec.toFixed(2),
        speed: speed,
        mbleft: (totalLeft / (1024 * 1024)).toFixed(2),
        mb: (totalSize / (1024 * 1024)).toFixed(2),
        sizeleft: this.formatBytes(totalLeft),
        size: this.formatBytes(totalSize),
        noofslots_total: activeDownloads.length,
        noofslots: activeDownloads.length,
        start: 0,
        limit: 0,
        finish: 0,
        status: queueStatus,
        timeleft: this.formatEta(totalEta),
        slots: slots,
        refresh_rate: 1,
        categories: ["*", "ephemera"],
        scripts: [],
      },
    };

    if (outputMode === "xml") {
      return this.jsonToXml(response);
    }

    return response;
  }

  /**
   * Format history response for SABnzbd API
   */
  async formatHistoryResponse(
    start: number = 0,
    limit: number = 50,
    outputMode: "json" | "xml" = "json",
    includeActive: boolean = false, // By default, history should NOT include active downloads
  ): Promise<Record<string, unknown> | string> {
    // Real SABnzbd only shows completed/failed in history, NOT active downloads
    let allDownloads: Download[];

    if (includeActive) {
      // Get ALL downloads including active ones (non-standard, for special cases)
      allDownloads = await downloadTracker.getAll();
    } else {
      // Get only completed/failed downloads (standard SABnzbd behavior)
      allDownloads = await downloadTracker.getByStatuses([
        "done",
        "available",
        "error",
        "cancelled",
      ]);
    }

    // Check if indexer-only mode is enabled
    const settings = await indexerSettingsService.getSettings();
    if (settings.indexerOnlyMode) {
      // Filter to only show indexer-initiated downloads
      allDownloads = allDownloads.filter((d) => d.downloadSource === "indexer");
    }

    // Sort by completion time (most recent first)
    allDownloads.sort((a: Download, b: Download) => {
      const aTime = a.completedAt || a.queuedAt;
      const bTime = b.completedAt || b.queuedAt;
      return bTime - aTime;
    });

    // Apply pagination
    const paginatedDownloads = allDownloads.slice(start, start + limit);

    // Fetch book metadata for all downloads
    const md5s = paginatedDownloads.map((d) => d.md5);
    const books = await bookService.getBooksByMd5s(md5s);
    const booksMap = new Map(books.map((b) => [b.md5, b]));

    const slots = await Promise.all(
      paginatedDownloads.map((d: Download) =>
        this.downloadToHistorySlot(d, booksMap.get(d.md5)),
      ),
    );

    // Calculate totals and statistics
    const totalSize = allDownloads.reduce(
      (sum: number, d: Download) => sum + (d.size || 0),
      0,
    );

    // Calculate time-based statistics (simplified - would need actual date filtering in production)
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const daySize = allDownloads
      .filter((d) => (d.completedAt || 0) > dayAgo)
      .reduce((sum, d) => sum + (d.size || 0), 0);
    const weekSize = allDownloads
      .filter((d) => (d.completedAt || 0) > weekAgo)
      .reduce((sum, d) => sum + (d.size || 0), 0);
    const monthSize = allDownloads
      .filter((d) => (d.completedAt || 0) > monthAgo)
      .reduce((sum, d) => sum + (d.size || 0), 0);

    // Get the most recent update time for change detection
    const lastUpdate = allDownloads.reduce((latest: number, d: Download) => {
      // For history items, we want to know when they were last modified
      // Use completedAt for finished items, or startedAt/queuedAt for others
      const time = d.completedAt || d.startedAt || d.queuedAt || 0;
      return Math.max(latest, time);
    }, 0);

    // Calculate seconds since last update (how many seconds ago was the last update)
    // If there's no history, return a large number (1 hour) to indicate no recent changes
    // This matches SABnzbd behavior where the value increases until there's a change
    const secondsSinceLastUpdate =
      lastUpdate > 0 ? Math.floor((Date.now() - lastUpdate) / 1000) : 3600; // Default to 1 hour if no history

    const response = {
      history: {
        version: "4.3.3",
        noofslots: allDownloads.length,
        ppslots: 0,
        openallslots: true,
        total_size: this.formatBytes(totalSize),
        month_size: this.formatBytes(monthSize),
        week_size: this.formatBytes(weekSize),
        day_size: this.formatBytes(daySize),
        last_history_update: secondsSinceLastUpdate, // Seconds since last update for Readarr polling
        slots: slots,
      },
    };

    if (outputMode === "xml") {
      return this.jsonToXml(response);
    }

    return response;
  }

  /**
   * Format version response
   */
  formatVersionResponse(
    outputMode: "json" | "xml" = "json",
  ): Record<string, unknown> | string {
    const response = {
      version: "4.5.5",
    };

    if (outputMode === "xml") {
      return this.jsonToXml(response);
    }

    return response;
  }

  /**
   * Simple JSON to XML converter
   */
  jsonToXml(obj: Record<string, unknown>, rootName: string = "root"): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';

    const convert = (data: unknown, name: string): string => {
      if (Array.isArray(data)) {
        return data.map((item) => convert(item, name)).join("");
      } else if (typeof data === "object" && data !== null) {
        let inner = "";
        for (const [key, value] of Object.entries(data)) {
          inner += convert(value, key);
        }
        return `<${name}>${inner}</${name}>`;
      } else {
        return `<${name}>${this.escapeXml(String(data))}</${name}>`;
      }
    };

    xml += convert(obj, rootName);
    return xml;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}

export const sabnzbdMapper = new SabnzbdMapper();
