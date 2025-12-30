import { appriseService } from "./apprise.js";
import { logger } from "../utils/logger.js";

const BLOCKED_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface SearcherHealthStatus {
  isBlocked: boolean;
  reason: string | null;
  blockedAt: number | null;
}

/**
 * Searcher Health Service
 * Tracks whether the search service (Anna's Archive) is blocked by ISP/network.
 *
 * Unlike FlareSolverr which uses periodic health checks, this service uses
 * on-demand detection during actual search requests. When all TLD variants
 * fail (network error or ISP block page), the service is marked as blocked.
 *
 * Blocked status has a 5-minute TTL to avoid hammering blocked domains.
 */
class SearcherHealthService {
  private currentStatus: SearcherHealthStatus = {
    isBlocked: false,
    reason: null,
    blockedAt: null,
  };

  /**
   * Get current searcher health status
   */
  getStatus(): SearcherHealthStatus {
    // Check if blocked status has expired
    if (this.currentStatus.isBlocked && this.currentStatus.blockedAt) {
      const elapsed = Date.now() - this.currentStatus.blockedAt;
      if (elapsed >= BLOCKED_TTL_MS) {
        // TTL expired, clear blocked status to allow retry
        logger.info(
          "[Searcher Health] Blocked status TTL expired, allowing retry",
        );
        this.currentStatus = {
          isBlocked: false,
          reason: null,
          blockedAt: null,
        };
      }
    }

    return { ...this.currentStatus };
  }

  /**
   * Check if search should be skipped due to blocked status
   * Returns true if blocked and within TTL
   */
  shouldSkipSearch(): boolean {
    const status = this.getStatus();
    return status.isBlocked;
  }

  /**
   * Mark the searcher as blocked (all TLD variants failed)
   * Called by scraper when all variants fail with network errors or block pages
   */
  async markBlocked(reason: string): Promise<void> {
    const wasBlocked = this.currentStatus.isBlocked;

    this.currentStatus = {
      isBlocked: true,
      reason,
      blockedAt: Date.now(),
    };

    if (!wasBlocked) {
      logger.warn(`[Searcher Health] Marking as blocked: ${reason}`);

      // Send notification for searcher becoming blocked (reuse service_unhealthy event)
      try {
        await appriseService.send("service_unhealthy", {
          reason: `Search service blocked: ${reason}`,
        });
      } catch (error) {
        logger.error(
          "[Searcher Health] Failed to send blocked notification:",
          error,
        );
      }
    }
  }

  /**
   * Mark the searcher as healthy (at least one variant succeeded)
   * Called by scraper when any variant returns a valid searcher page
   */
  async markHealthy(): Promise<void> {
    const wasBlocked = this.currentStatus.isBlocked;

    this.currentStatus = {
      isBlocked: false,
      reason: null,
      blockedAt: null,
    };

    if (wasBlocked) {
      logger.info("[Searcher Health] Recovered - searcher now accessible");

      // Send notification for searcher recovery (reuse service_recovered event)
      try {
        await appriseService.send("service_recovered", {});
      } catch (error) {
        logger.error(
          "[Searcher Health] Failed to send recovery notification:",
          error,
        );
      }
    }
  }

  /**
   * Clear blocked status (e.g., when user changes searcher URL in settings)
   */
  clearBlockedStatus(): void {
    if (this.currentStatus.isBlocked) {
      logger.info(
        "[Searcher Health] Clearing blocked status due to settings change",
      );
      this.currentStatus = {
        isBlocked: false,
        reason: null,
        blockedAt: null,
      };
    }
  }
}

// Export singleton instance
export const searcherHealthService = new SearcherHealthService();
