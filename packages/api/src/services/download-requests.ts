import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  downloadRequests,
  books,
  type DownloadRequest,
  type NewDownloadRequest,
  type Book,
} from "../db/schema.js";
import type {
  RequestQueryParams,
  SavedRequestWithBook,
  Book as SharedBook,
} from "@ephemera/shared";

// Re-export for convenience
export type { RequestQueryParams };
export type DownloadRequestWithBook = SavedRequestWithBook;

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
 * Download Requests Service
 * Manages saved book search requests that are checked periodically
 */
class DownloadRequestsService {
  /**
   * Create a new download request
   * Checks for duplicate active requests with same query params
   */
  async createRequest(
    queryParams: RequestQueryParams,
    userId: string,
  ): Promise<DownloadRequest> {
    try {
      // Check for duplicate active request
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
      const newRequest: NewDownloadRequest = {
        queryParams,
        userId,
        status: "active",
        createdAt: now,
        lastCheckedAt: null,
        fulfilledAt: null,
        fulfilledBookMd5: null,
      };

      const result = await db
        .insert(downloadRequests)
        .values(newRequest)
        .returning();

      console.log("[Download Requests] Created new request:", result[0].id);
      return result[0];
    } catch (error) {
      console.error("[Download Requests] Error creating request:", error);
      throw error;
    }
  }

  /**
   * Get all download requests with optional status filter
   * Returns requests with fulfilled book info if available
   */
  async getAllRequests(
    statusFilter?: "active" | "fulfilled" | "cancelled",
    userId?: string,
  ): Promise<DownloadRequestWithBook[]> {
    try {
      const { user } = await import("../db/schema.js");

      let query = db
        .select({
          request: downloadRequests,
          book: books,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        })
        .from(downloadRequests)
        .leftJoin(books, eq(downloadRequests.fulfilledBookMd5, books.md5))
        .leftJoin(user, eq(downloadRequests.userId, user.id))
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

      return results.map(({ request, book, user: requestUser }) => ({
        ...request,
        fulfilledBook: convertDbBookToSharedBook(book),
        userId: request.userId,
        userName: requestUser?.name || undefined,
        userEmail: requestUser?.email || undefined,
      }));
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
   */
  async getStats(): Promise<{
    active: number;
    fulfilled: number;
    cancelled: number;
    total: number;
  }> {
    try {
      const allRequests = await db.select().from(downloadRequests);

      const stats = {
        active: allRequests.filter((r) => r.status === "active").length,
        fulfilled: allRequests.filter((r) => r.status === "fulfilled").length,
        cancelled: allRequests.filter((r) => r.status === "cancelled").length,
        total: allRequests.length,
      };

      return stats;
    } catch (error) {
      console.error("[Download Requests] Error getting stats:", error);
      return { active: 0, fulfilled: 0, cancelled: 0, total: 0 };
    }
  }

  /**
   * Check if a duplicate active request exists with the same query params for a user
   */
  private async findDuplicateActiveRequest(
    queryParams: RequestQueryParams,
    userId: string,
  ): Promise<DownloadRequest | null> {
    try {
      const activeRequests = await db
        .select()
        .from(downloadRequests)
        .where(eq(downloadRequests.status, "active"));

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
