import { useMemo } from "react";
import { useQueue } from "./useQueue";
import type { QueueItem, DownloadStatus } from "@ephemera/shared";

/**
 * Hook to get the live download status of a book from the queue cache.
 * This makes components reactive to SSE queue updates.
 *
 * @param md5 - The MD5 hash of the book
 * @param fallbackStatus - Optional fallback status from search results
 * @returns Live queue status and metadata
 */
export const useBookStatus = (
  md5: string,
  fallbackStatus?: DownloadStatus | null,
) => {
  // Read from queue cache (no SSE connection, just cache reads)
  const { data: queue } = useQueue({ enableSSE: false });

  // Look up the book in queue cache across all categories
  const queueItem = useMemo<QueueItem | null>(() => {
    if (!queue) return null;

    // Check each queue category for this book's MD5
    const categories = [
      "available",
      "queued",
      "downloading",
      "delayed",
      "error",
      "cancelled",
      "done",
    ] as const;

    for (const category of categories) {
      const item = queue[category]?.[md5];
      if (item) {
        return item;
      }
    }

    return null;
  }, [queue, md5]);

  return {
    // Use queue status if available, otherwise fall back to book's initial status
    status: queueItem?.status || fallbackStatus || null,
    // Additional queue metadata
    progress: queueItem?.progress,
    error: queueItem?.error,
    nextRetryAt: queueItem?.nextRetryAt,
    queuedAt: queueItem?.queuedAt,
    startedAt: queueItem?.startedAt,
    completedAt: queueItem?.completedAt,
    // Full queue item for advanced use cases
    queueItem,
    // Convenience flags
    isInQueue: queueItem !== null,
    isDownloading: queueItem?.status === "downloading",
    isQueued: queueItem?.status === "queued",
    isAvailable: queueItem?.status === "available",
    isDelayed: queueItem?.status === "delayed",
    isError: queueItem?.status === "error",
  };
};
