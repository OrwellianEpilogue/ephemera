import { eq, desc, count } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "../db/index.js";
import {
  downloadRequests,
  books,
  bookMetadata,
  user,
  type DownloadRequest,
  type NewDownloadRequest,
  type Book,
  type BookMetadata,
} from "../db/schema.js";
import type {
  RequestQueryParams,
  SavedRequestWithMetadata,
  Book as SharedBook,
  BookMetadata as SharedBookMetadata,
} from "@ephemera/shared";

// Re-export for convenience
export type { RequestQueryParams };
export type DownloadRequestWithBook = SavedRequestWithMetadata;

/**
 * Convert database Book to shared Book schema
 * Transforms null values to undefined for optional fields
 */
function convertDbBookToSharedBook(dbBook: Book | null): SharedBook | null {
  if (!dbBook) return null;

  return {
    md5: dbBook.md5,
    title: dbBook.title,
    authors: dbBook.authors ?? undefined,
    publisher: dbBook.publisher ?? undefined,
    description: dbBook.description ?? undefined,
    coverUrl: dbBook.coverUrl ?? undefined,
    filename: dbBook.filename ?? undefined,
    language: dbBook.language ?? undefined,
    format: dbBook.format ?? undefined,
    size: dbBook.size ?? undefined,
    year: dbBook.year ?? undefined,
    contentType: dbBook.contentType ?? undefined,
    source: dbBook.source ?? undefined,
    saves: dbBook.saves ?? undefined,
    lists: dbBook.lists ?? undefined,
    issues: dbBook.issues ?? undefined,
  };
}

/**
 * Convert database BookMetadata to shared BookMetadata schema
 * Transforms timestamp fields to ISO strings
 */
function convertDbMetadataToShared(
  dbMetadata: BookMetadata | null,
): SharedBookMetadata | null {
  if (!dbMetadata) return null;

  return {
    id: dbMetadata.id,
    requestId: dbMetadata.requestId,
    source: dbMetadata.source as "goodreads" | "storygraph" | "hardcover",
    sourceBookId: dbMetadata.sourceBookId,
    sourceUrl: dbMetadata.sourceUrl,
    title: dbMetadata.title,
    author: dbMetadata.author,
    description: dbMetadata.description,
    isbn: dbMetadata.isbn,
    seriesName: dbMetadata.seriesName,
    seriesPosition: dbMetadata.seriesPosition,
    publishedYear: dbMetadata.publishedYear,
    pages: dbMetadata.pages,
    rating: dbMetadata.rating,
    averageRating: dbMetadata.averageRating,
    genres: dbMetadata.genres,
    coverUrl: dbMetadata.coverUrl,
    coverPath: dbMetadata.coverPath,
    fetchedAt: dbMetadata.fetchedAt,
    createdAt: dbMetadata.createdAt.toISOString(),
    updatedAt: dbMetadata.updatedAt.toISOString(),
  };
}

/**
 * Download Requests Service
 * Manages saved book search requests that are checked periodically
 */
class DownloadRequestsService {
  /**
   * Create a new download request
   * Checks for duplicate active requests with same query params
   * @param queryParams - The search parameters for the request
   * @param userId - The user creating the request
   * @param canStartDownloads - Whether the user has permission to start downloads
   *                            If false, request will be created as pending_approval
   * @param targetBookMd5 - Optional MD5 of specific book to download when approved
   */
  async createRequest(
    queryParams: RequestQueryParams,
    userId: string,
    canStartDownloads: boolean = true,
    targetBookMd5?: string,
  ): Promise<DownloadRequest> {
    try {
      // Check for duplicate active/pending request
      const existing = await this.findDuplicateActiveRequest(
        queryParams,
        userId,
      );
      if (existing) {
        throw new Error(
          "An active request with these search parameters already exists",
        );
      }

      const now = Date.now();
      const initialStatus = canStartDownloads ? "active" : "pending_approval";
      const newRequest: NewDownloadRequest = {
        queryParams,
        userId,
        status: initialStatus,
        createdAt: now,
        lastCheckedAt: null,
        fulfilledAt: null,
        fulfilledBookMd5: null,
        targetBookMd5: targetBookMd5 || null,
        approverId: null,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
      };

      const result = await db
        .insert(downloadRequests)
        .values(newRequest)
        .returning();

      console.log(
        "[Download Requests] Created new request:",
        result[0].id,
        "status:",
        initialStatus,
        targetBookMd5 ? `targetMd5: ${targetBookMd5}` : "",
      );
      return result[0];
    } catch (error) {
      console.error("[Download Requests] Error creating request:", error);
      throw error;
    }
  }

  /**
   * Get all download requests with optional status filter
   * Returns requests with fulfilled book info, approver info, and metadata if available
   */
  async getAllRequests(
    statusFilter?:
      | "pending_approval"
      | "active"
      | "fulfilled"
      | "cancelled"
      | "rejected",
    userId?: string,
  ): Promise<DownloadRequestWithBook[]> {
    try {
      const approverAlias = alias(user, "approver");

      let query = db
        .select({
          request: downloadRequests,
          book: books,
          metadata: bookMetadata,
          user: {
            id: user.id,
            name: user.name,
          },
          approver: {
            id: approverAlias.id,
            name: approverAlias.name,
          },
        })
        .from(downloadRequests)
        .leftJoin(books, eq(downloadRequests.fulfilledBookMd5, books.md5))
        .leftJoin(bookMetadata, eq(downloadRequests.id, bookMetadata.requestId))
        .leftJoin(user, eq(downloadRequests.userId, user.id))
        .leftJoin(
          approverAlias,
          eq(downloadRequests.approverId, approverAlias.id),
        )
        .orderBy(desc(downloadRequests.createdAt));

      // Build where clause
      const conditions = [];
      if (statusFilter) {
        conditions.push(eq(downloadRequests.status, statusFilter));
      }
      if (userId) {
        conditions.push(eq(downloadRequests.userId, userId));
      }

      let results;
      if (conditions.length > 0) {
        // @ts-expect-error - drizzle-orm where clause typing issue
        results = await query.where(...conditions);
      } else {
        results = await query;
      }

      return results.map(
        ({ request, book, metadata, user: requestUser, approver }) => ({
          ...request,
          fulfilledBook: convertDbBookToSharedBook(book),
          metadata: convertDbMetadataToShared(metadata),
          userId: request.userId,
          userName: requestUser?.name || undefined,
          approverId: request.approverId,
          approverName: approver?.name || undefined,
          approvedAt: request.approvedAt,
          rejectedAt: request.rejectedAt,
          rejectionReason: request.rejectionReason,
        }),
      );
    } catch (error) {
      console.error("[Download Requests] Error fetching requests:", error);
      throw error;
    }
  }

  /**
   * Get requests by user ID
   */
  async getRequestsByUser(userId: string): Promise<DownloadRequestWithBook[]> {
    return this.getAllRequests(undefined, userId);
  }

  /**
   * Get a single request by ID
   */
  async getRequestById(id: number): Promise<DownloadRequest | null> {
    try {
      const result = await db
        .select()
        .from(downloadRequests)
        .where(eq(downloadRequests.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error("[Download Requests] Error fetching request:", error);
      throw error;
    }
  }

  /**
   * Get all active requests (for background checker)
   */
  async getActiveRequests(): Promise<DownloadRequest[]> {
    try {
      const results = await db
        .select()
        .from(downloadRequests)
        .where(eq(downloadRequests.status, "active"))
        .orderBy(downloadRequests.lastCheckedAt); // Check oldest first

      return results;
    } catch (error) {
      console.error(
        "[Download Requests] Error fetching active requests:",
        error,
      );
      return [];
    }
  }

  /**
   * Mark a request as fulfilled with the book that was downloaded
   */
  async markFulfilled(id: number, bookMd5: string): Promise<void> {
    try {
      const now = Date.now();
      await db
        .update(downloadRequests)
        .set({
          status: "fulfilled",
          fulfilledAt: now,
          fulfilledBookMd5: bookMd5,
        })
        .where(eq(downloadRequests.id, id));

      console.log(
        "[Download Requests] Marked request as fulfilled:",
        id,
        bookMd5,
      );
    } catch (error) {
      console.error(
        "[Download Requests] Error marking request as fulfilled:",
        error,
      );
      throw error;
    }
  }

  /**
   * Update the last checked timestamp for a request
   */
  async updateLastChecked(id: number): Promise<void> {
    try {
      await db
        .update(downloadRequests)
        .set({ lastCheckedAt: Date.now() })
        .where(eq(downloadRequests.id, id));
    } catch (error) {
      console.error("[Download Requests] Error updating last checked:", error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Delete a request by ID
   */
  async deleteRequest(id: number): Promise<void> {
    try {
      await db.delete(downloadRequests).where(eq(downloadRequests.id, id));
      console.log("[Download Requests] Deleted request:", id);
    } catch (error) {
      console.error("[Download Requests] Error deleting request:", error);
      throw error;
    }
  }

  /**
   * Cancel a request (mark as cancelled without deleting)
   */
  async cancelRequest(id: number): Promise<void> {
    try {
      await db
        .update(downloadRequests)
        .set({ status: "cancelled" })
        .where(eq(downloadRequests.id, id));

      console.log("[Download Requests] Cancelled request:", id);
    } catch (error) {
      console.error("[Download Requests] Error cancelling request:", error);
      throw error;
    }
  }

  /**
   * Reactivate a cancelled request
   */
  async reactivateRequest(id: number): Promise<void> {
    try {
      const request = await this.getRequestById(id);
      if (!request) {
        throw new Error("Request not found");
      }

      if (request.status !== "cancelled") {
        throw new Error("Only cancelled requests can be reactivated");
      }

      await db
        .update(downloadRequests)
        .set({
          status: "active",
          lastCheckedAt: null, // Reset to be checked soon
        })
        .where(eq(downloadRequests.id, id));

      console.log("[Download Requests] Reactivated request:", id);
    } catch (error) {
      console.error("[Download Requests] Error reactivating request:", error);
      throw error;
    }
  }

  /**
   * Get count of requests by status
   * Uses SQL GROUP BY for efficient aggregation (no full table scan)
   */
  async getStats(): Promise<{
    pending_approval: number;
    active: number;
    fulfilled: number;
    cancelled: number;
    rejected: number;
    total: number;
  }> {
    try {
      // Use SQL GROUP BY for efficient counting instead of loading all rows
      const statusCounts = await db
        .select({
          status: downloadRequests.status,
          count: count(),
        })
        .from(downloadRequests)
        .groupBy(downloadRequests.status);

      // Convert array of {status, count} to object
      const stats = {
        pending_approval: 0,
        active: 0,
        fulfilled: 0,
        cancelled: 0,
        rejected: 0,
        total: 0,
      };

      for (const row of statusCounts) {
        if (row.status === "pending_approval")
          stats.pending_approval = row.count;
        else if (row.status === "active") stats.active = row.count;
        else if (row.status === "fulfilled") stats.fulfilled = row.count;
        else if (row.status === "cancelled") stats.cancelled = row.count;
        else if (row.status === "rejected") stats.rejected = row.count;
        stats.total += row.count;
      }

      return stats;
    } catch (error) {
      console.error("[Download Requests] Error getting stats:", error);
      return {
        pending_approval: 0,
        active: 0,
        fulfilled: 0,
        cancelled: 0,
        rejected: 0,
        total: 0,
      };
    }
  }

  /**
   * Approve a pending request
   * Changes status to "active" so it will be checked by the background checker
   */
  async approveRequest(id: number, approverId: string): Promise<void> {
    try {
      const now = Date.now();
      await db
        .update(downloadRequests)
        .set({
          status: "active",
          approverId,
          approvedAt: now,
        })
        .where(eq(downloadRequests.id, id));

      console.log("[Download Requests] Approved request:", id);
    } catch (error) {
      console.error("[Download Requests] Error approving request:", error);
      throw error;
    }
  }

  /**
   * Reject a pending request
   */
  async rejectRequest(
    id: number,
    approverId: string,
    reason?: string,
  ): Promise<void> {
    try {
      const now = Date.now();
      await db
        .update(downloadRequests)
        .set({
          status: "rejected",
          approverId,
          rejectedAt: now,
          rejectionReason: reason || null,
        })
        .where(eq(downloadRequests.id, id));

      console.log("[Download Requests] Rejected request:", id);
    } catch (error) {
      console.error("[Download Requests] Error rejecting request:", error);
      throw error;
    }
  }

  /**
   * Check if a duplicate active or pending request exists with the same query params for a user
   */
  private async findDuplicateActiveRequest(
    queryParams: RequestQueryParams,
    userId: string,
  ): Promise<DownloadRequest | null> {
    try {
      const { inArray } = await import("drizzle-orm");
      // Check both active and pending_approval requests
      const activeRequests = await db
        .select()
        .from(downloadRequests)
        .where(
          inArray(downloadRequests.status, ["active", "pending_approval"]),
        );

      // Find matching query params for this user
      const duplicate = activeRequests.find((request) => {
        return (
          request.userId === userId &&
          JSON.stringify(request.queryParams) === JSON.stringify(queryParams)
        );
      });

      return duplicate || null;
    } catch (error) {
      console.error(
        "[Download Requests] Error checking for duplicates:",
        error,
      );
      return null;
    }
  }
}

// Export singleton instance
export const downloadRequestsService = new DownloadRequestsService();
