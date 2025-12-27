import { EventEmitter } from "events";
import { downloadRequestsService } from "./download-requests.js";
import { logger } from "../utils/logger.js";
import type {
  RequestQueryParams,
  SavedRequestWithBook,
  RequestStats,
} from "@ephemera/shared";

export interface RequestsUpdate {
  requests: SavedRequestWithBook[];
  stats: RequestStats;
}

/**
 * RequestsManager - Manages download requests with real-time event emission
 */
export class RequestsManager extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Emit requests-updated event with current requests and stats
   */
  private async emitRequestsUpdate() {
    try {
      const requests = await downloadRequestsService.getAllRequests();
      const stats = await downloadRequestsService.getStats();

      this.emit("requests-updated", { requests, stats });
    } catch (error) {
      logger.error("Failed to emit requests update:", error);
    }
  }

  /**
   * Create a new download request
   * @param queryParams - The search parameters for the request
   * @param userId - The user creating the request
   * @param canStartDownloads - Whether the user can start downloads directly
   * @param targetBookMd5 - Optional MD5 of specific book to download when approved
   */
  async createRequest(
    queryParams: RequestQueryParams,
    userId: string,
    canStartDownloads: boolean = true,
    targetBookMd5?: string,
  ) {
    const request = await downloadRequestsService.createRequest(
      queryParams,
      userId,
      canStartDownloads,
      targetBookMd5,
    );
    await this.emitRequestsUpdate();
    return request;
  }

  /**
   * Get all requests with optional status filter
   */
  async getAllRequests(
    statusFilter?:
      | "pending_approval"
      | "active"
      | "fulfilled"
      | "cancelled"
      | "rejected",
  ) {
    return downloadRequestsService.getAllRequests(statusFilter);
  }

  /**
   * Get request statistics
   */
  async getStats() {
    return downloadRequestsService.getStats();
  }

  /**
   * Delete a request
   */
  async deleteRequest(id: number) {
    await downloadRequestsService.deleteRequest(id);
    await this.emitRequestsUpdate();
  }

  /**
   * Cancel a request
   */
  async cancelRequest(id: number) {
    await downloadRequestsService.cancelRequest(id);
    await this.emitRequestsUpdate();
  }

  /**
   * Reactivate a cancelled request
   */
  async reactivateRequest(id: number) {
    await downloadRequestsService.reactivateRequest(id);
    await this.emitRequestsUpdate();
  }

  /**
   * Approve a pending request
   */
  async approveRequest(id: number, approverId: string) {
    await downloadRequestsService.approveRequest(id, approverId);
    await this.emitRequestsUpdate();
  }

  /**
   * Reject a pending request
   */
  async rejectRequest(id: number, approverId: string, reason?: string) {
    await downloadRequestsService.rejectRequest(id, approverId, reason);
    await this.emitRequestsUpdate();
  }

  /**
   * Mark a request as fulfilled (called by request-checker)
   */
  async markFulfilled(id: number, bookMd5: string) {
    await downloadRequestsService.markFulfilled(id, bookMd5);
    await this.emitRequestsUpdate();
  }

  /**
   * Update last checked timestamp (called by request-checker)
   */
  async updateLastChecked(id: number) {
    await downloadRequestsService.updateLastChecked(id);
    // Don't emit update for lastCheckedAt changes - not critical for UI
  }

  /**
   * Get full update data (for SSE initial state)
   */
  async getFullUpdate(): Promise<RequestsUpdate> {
    const requests = await this.getAllRequests();
    const stats = await this.getStats();
    return { requests, stats };
  }
}

// Export singleton instance
export const requestsManager = new RequestsManager();
