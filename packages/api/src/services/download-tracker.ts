import { eq, like, or, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { downloads, type Download, type NewDownload } from "../db/schema.js";
import type { DownloadStatus, QueueItem } from "@ephemera/shared";
import { logger } from "../utils/logger.js";

export class DownloadTracker {
  async create(data: NewDownload): Promise<Download> {
    try {
      const result = await db.insert(downloads).values(data).returning();
      return result[0];
    } catch (error) {
      logger.error("Failed to create download record:", error);
      throw error;
    }
  }

  async get(md5: string): Promise<Download | undefined> {
    try {
      const result = await db
        .select()
        .from(downloads)
        .where(eq(downloads.md5, md5))
        .limit(1);

      return result[0];
    } catch (error) {
      logger.error(`Failed to get download ${md5}:`, error);
      throw error;
    }
  }

  async update(
    md5: string,
    data: Partial<NewDownload>,
  ): Promise<Download | undefined> {
    try {
      const result = await db
        .update(downloads)
        .set(data)
        .where(eq(downloads.md5, md5))
        .returning();

      return result[0];
    } catch (error) {
      logger.error(`Failed to update download ${md5}:`, error);
      throw error;
    }
  }

  async updateProgress(
    md5: string,
    downloadedBytes: number,
    totalBytes: number,
    speed?: string,
    eta?: number,
  ): Promise<void> {
    const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;

    await this.update(md5, {
      downloadedBytes,
      size: totalBytes,
      progress,
      speed,
      eta,
    });
  }

  async markStarted(md5: string, tempPath: string): Promise<void> {
    await this.update(md5, {
      status: "downloading",
      startedAt: Date.now(),
      tempPath,
    });
  }

  async markCompleted(md5: string): Promise<void> {
    const download = await this.get(md5);
    await this.update(md5, {
      status: "done",
      completedAt: Date.now(),
      progress: 100,
      downloadedBytes: download?.size || undefined,
    });
  }

  async markAvailable(md5: string, finalPath: string | null): Promise<void> {
    await this.update(md5, {
      status: "available",
      finalPath: finalPath || undefined,
    });
  }

  async markError(md5: string, error: string): Promise<void> {
    const download = await this.get(md5);
    const retryCount = (download?.retryCount || 0) + 1;

    await this.update(md5, {
      status: "error",
      error,
      retryCount,
    });
  }

  async markCancelled(md5: string): Promise<void> {
    await this.update(md5, {
      status: "cancelled",
    });
  }

  // Quota tracking methods
  async updateQuotaInfo(
    md5: string,
    downloadsLeft: number,
    downloadsPerDay: number,
  ): Promise<void> {
    await this.update(md5, {
      downloadsLeft,
      downloadsPerDay,
      quotaCheckedAt: Date.now(),
    });
  }

  async getQuotaInfo(md5: string): Promise<{
    downloadsLeft: number | null;
    downloadsPerDay: number | null;
    quotaCheckedAt: number | null;
  } | null> {
    const download = await this.get(md5);
    if (!download) return null;

    return {
      downloadsLeft: download.downloadsLeft || null,
      downloadsPerDay: download.downloadsPerDay || null,
      quotaCheckedAt: download.quotaCheckedAt || null,
    };
  }

  // Booklore upload status methods
  async markUploadPending(md5: string): Promise<void> {
    await this.update(md5, {
      uploadStatus: "pending",
      uploadError: null,
    });
  }

  async markUploadStarted(md5: string): Promise<void> {
    await this.update(md5, {
      uploadStatus: "uploading",
    });
  }

  async markUploadCompleted(md5: string): Promise<void> {
    await this.update(md5, {
      uploadStatus: "completed",
      uploadedAt: Date.now(),
      uploadError: null,
    });
  }

  async markUploadFailed(md5: string, error: string): Promise<void> {
    await this.update(md5, {
      uploadStatus: "failed",
      uploadError: error,
    });
  }

  async getByUploadStatus(
    uploadStatus: "pending" | "uploading" | "completed" | "failed",
  ): Promise<Download[]> {
    try {
      return await db
        .select()
        .from(downloads)
        .where(eq(downloads.uploadStatus, uploadStatus));
    } catch (error) {
      logger.error(
        `Failed to get downloads by upload status ${uploadStatus}:`,
        error,
      );
      throw error;
    }
  }

  async getPendingUploads(): Promise<Download[]> {
    return await this.getByUploadStatus("pending");
  }

  async getByStatus(status: DownloadStatus): Promise<Download[]> {
    try {
      return await db
        .select()
        .from(downloads)
        .where(eq(downloads.status, status))
        .orderBy(desc(downloads.queuedAt));
    } catch (error) {
      logger.error(`Failed to get downloads by status ${status}:`, error);
      throw error;
    }
  }

  async getStatusByMd5s(
    md5s: string[],
  ): Promise<Array<{ md5: string; status: DownloadStatus }>> {
    try {
      if (md5s.length === 0) return [];

      // Get all downloads that match the md5s
      const results = await db
        .select({ md5: downloads.md5, status: downloads.status })
        .from(downloads);

      // Filter by md5s
      return results
        .filter((result) => md5s.includes(result.md5))
        .map((result) => ({
          md5: result.md5,
          status: result.status as DownloadStatus,
        }));
    } catch (error) {
      logger.error("Failed to get statuses by md5s:", error);
      throw error;
    }
  }

  async getIncomplete(): Promise<Download[]> {
    try {
      return await db
        .select()
        .from(downloads)
        .where(
          or(
            eq(downloads.status, "queued"),
            eq(downloads.status, "downloading"),
            eq(downloads.status, "delayed"),
          ),
        );
    } catch (error) {
      logger.error("Failed to get incomplete downloads:", error);
      throw error;
    }
  }

  async search(
    searchTerm: string,
    status?: DownloadStatus,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Download[]> {
    try {
      let query = db.select().from(downloads);

      // Apply status filter
      if (status) {
        query = query.where(eq(downloads.status, status)) as typeof query;
      }

      // Apply search filter
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        query = query.where(
          or(
            like(downloads.title, searchPattern),
            like(downloads.author, searchPattern),
            like(downloads.filename, searchPattern),
          ),
        ) as typeof query;
      }

      // Apply pagination
      return await query.limit(limit).offset(offset);
    } catch (error) {
      logger.error("Failed to search downloads:", error);
      throw error;
    }
  }

  async getStats(): Promise<{
    total: number;
    available: number;
    downloading: number;
    queued: number;
    errors: number;
    totalSize: number;
    successRate: number;
  }> {
    try {
      const stats = await db
        .select({
          status: downloads.status,
          count: sql<number>`count(*)`,
          totalSize: sql<number>`sum(${downloads.size})`,
        })
        .from(downloads)
        .groupBy(downloads.status);

      let total = 0;
      let available = 0;
      let downloading = 0;
      let queued = 0;
      let errors = 0;
      let totalSize = 0;

      for (const stat of stats) {
        const count = Number(stat.count);
        total += count;

        if (stat.totalSize) {
          totalSize += Number(stat.totalSize);
        }

        switch (stat.status) {
          case "available":
            available = count;
            break;
          case "downloading":
            downloading = count;
            break;
          case "queued":
            queued = count;
            break;
          case "error":
            errors = count;
            break;
        }
      }

      const successRate = total > 0 ? (available / total) * 100 : 0;

      return {
        total,
        available,
        downloading,
        queued,
        errors,
        totalSize,
        successRate,
      };
    } catch (error) {
      logger.error("Failed to get stats:", error);
      throw error;
    }
  }

  downloadToQueueItem(download: Download): QueueItem {
    return {
      md5: download.md5,
      title: download.title,
      status: download.status as DownloadStatus,
      progress: download.progress || 0,
      downloadedBytes: download.downloadedBytes || undefined,
      totalBytes: download.size || undefined,
      speed: download.speed || undefined,
      eta: download.eta || undefined,
      error: download.error || undefined,
      filePath: download.finalPath || undefined,
      queuedAt: new Date(download.queuedAt).toISOString(),
      startedAt: download.startedAt
        ? new Date(download.startedAt).toISOString()
        : undefined,
      completedAt: download.completedAt
        ? new Date(download.completedAt).toISOString()
        : undefined,
      // Retry tracking
      retryCount: download.retryCount || undefined,
      delayedRetryCount: download.delayedRetryCount || undefined,
      nextRetryAt: download.nextRetryAt
        ? new Date(download.nextRetryAt).toISOString()
        : undefined,
      // Quota tracking
      downloadsLeft: download.downloadsLeft || undefined,
      downloadsPerDay: download.downloadsPerDay || undefined,
      quotaCheckedAt: download.quotaCheckedAt
        ? new Date(download.quotaCheckedAt).toISOString()
        : undefined,
      // Optional Booklore upload fields
      uploadStatus: download.uploadStatus || undefined,
      uploadedAt: download.uploadedAt
        ? new Date(download.uploadedAt).toISOString()
        : undefined,
      uploadError: download.uploadError || undefined,
    };
  }
}

export const downloadTracker = new DownloadTracker();
