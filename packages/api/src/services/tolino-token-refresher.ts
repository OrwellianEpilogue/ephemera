import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { tolinoSettings } from "../db/schema.js";
import { tolinoAuthService } from "./tolino/auth.js";
import type { ResellerId } from "./tolino/resellers.js";
import { logger } from "../utils/logger.js";

/**
 * Proactive Token Refresher Service for Tolino Cloud
 * Runs in background to refresh access tokens before they expire.
 * Unlike Booklore (single-user), this handles multiple users.
 */
class TolinoTokenRefresher {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  private isRunning = false;

  /**
   * Start the token refresher background service
   */
  start(): void {
    if (this.isRunning) {
      logger.debug("[Tolino Token Refresher] Already running");
      return;
    }

    logger.info(
      "[Tolino Token Refresher] Starting background token refresh service (checks every 30 minutes)",
    );

    // Run immediately on start
    this.checkAndRefreshTokens().catch((error) => {
      logger.error(
        "[Tolino Token Refresher] Error during initial check:",
        error,
      );
    });

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndRefreshTokens().catch((error) => {
        logger.error(
          "[Tolino Token Refresher] Error during scheduled check:",
          error,
        );
      });
    }, this.CHECK_INTERVAL_MS);

    this.isRunning = true;
  }

  /**
   * Stop the token refresher background service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info("[Tolino Token Refresher] Stopped");
    }
  }

  /**
   * Check all users' tokens and refresh if needed
   */
  private async checkAndRefreshTokens(): Promise<void> {
    try {
      // Get all users with Tolino configured (have tokens)
      const allSettings = await db
        .select()
        .from(tolinoSettings)
        .where(
          and(
            isNotNull(tolinoSettings.accessToken),
            isNotNull(tolinoSettings.refreshToken),
            isNotNull(tolinoSettings.tokenExpiresAt),
          ),
        );

      if (allSettings.length === 0) {
        logger.debug("[Tolino Token Refresher] No configured users found");
        return;
      }

      logger.debug(
        `[Tolino Token Refresher] Checking ${allSettings.length} user(s) for token refresh`,
      );

      let refreshed = 0;
      let failed = 0;

      for (const settings of allSettings) {
        // Skip if token doesn't need refresh yet
        if (!tolinoAuthService.shouldRefreshToken(settings.tokenExpiresAt!)) {
          continue;
        }

        const expiresIn = Math.floor(
          (settings.tokenExpiresAt! - Date.now()) / 1000 / 60,
        );
        logger.info(
          `[Tolino Token Refresher] Token for user ${settings.userId} expires in ${expiresIn} min, refreshing...`,
        );

        try {
          const newTokens = await tolinoAuthService.refreshToken(
            settings.refreshToken!,
            settings.resellerId as ResellerId,
          );

          // Update tokens in database
          await db
            .update(tolinoSettings)
            .set({
              accessToken: newTokens.accessToken,
              refreshToken: newTokens.refreshToken,
              tokenExpiresAt: newTokens.expiresAt,
              updatedAt: new Date(),
            })
            .where(eq(tolinoSettings.userId, settings.userId));

          refreshed++;
          const newExpiresIn = Math.floor(
            (newTokens.expiresAt - Date.now()) / 1000 / 60,
          );
          logger.info(
            `[Tolino Token Refresher] Token refreshed for user ${settings.userId} (valid for ${newExpiresIn} min)`,
          );
        } catch (error) {
          failed++;
          logger.error(
            `[Tolino Token Refresher] Failed to refresh token for user ${settings.userId}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      if (refreshed > 0 || failed > 0) {
        logger.info(
          `[Tolino Token Refresher] Completed: ${refreshed} refreshed, ${failed} failed`,
        );
      }
    } catch (error) {
      logger.error("[Tolino Token Refresher] Error:", error);
    }
  }

  /**
   * Manually trigger a token refresh check (useful for testing)
   */
  async triggerRefresh(): Promise<void> {
    logger.info("[Tolino Token Refresher] Manual refresh triggered");
    await this.checkAndRefreshTokens();
  }
}

// Export singleton instance
export const tolinoTokenRefresher = new TolinoTokenRefresher();
