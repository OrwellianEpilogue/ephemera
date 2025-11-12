import { bookloreSettingsService } from "./booklore-settings.js";
import { refreshAccessToken, isTokenExpired } from "./booklore-auth.js";

/**
 * Proactive Token Refresher Service
 * Runs in background to refresh Booklore access tokens before they expire
 * Checks every 30 minutes and refreshes if token expires within 5 minutes
 */
class BookloreTokenRefresher {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly REFRESH_BUFFER_MINUTES = 5; // Refresh if expires in < 5 min
  private isRunning = false;

  /**
   * Start the token refresher background service
   */
  start(): void {
    if (this.isRunning) {
      console.log("[Token Refresher] Already running");
      return;
    }

    console.log(
      "[Token Refresher] Starting background token refresh service (checks every 30 minutes)",
    );

    // Run immediately on start
    this.checkAndRefreshToken().catch((error) => {
      console.error(
        "[Token Refresher] Error during initial token check:",
        error,
      );
    });

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndRefreshToken().catch((error) => {
        console.error(
          "[Token Refresher] Error during scheduled token check:",
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
      console.log("[Token Refresher] Stopped");
    }
  }

  /**
   * Check if token needs refresh and refresh if necessary
   */
  private async checkAndRefreshToken(): Promise<void> {
    try {
      // Get current settings
      const settings = await bookloreSettingsService.getSettings();

      // Skip if Booklore not enabled or not configured
      if (!settings || !settings.enabled) {
        return;
      }

      if (
        !settings.baseUrl ||
        !settings.refreshToken ||
        !settings.accessToken ||
        !settings.accessTokenExpiresAt
      ) {
        console.log(
          "[Token Refresher] Booklore not fully configured, skipping token refresh",
        );
        return;
      }

      // Check if token needs refresh
      if (
        !isTokenExpired(
          settings.accessTokenExpiresAt,
          this.REFRESH_BUFFER_MINUTES,
        )
      ) {
        // Token still valid, no need to refresh
        const expiresIn = Math.floor(
          (settings.accessTokenExpiresAt - Date.now()) / 1000 / 60,
        );
        console.log(
          `[Token Refresher] Access token still valid (expires in ${expiresIn} minutes)`,
        );
        return;
      }

      // Token expires soon, refresh it
      console.log(
        "[Token Refresher] Token expiring soon, refreshing proactively...",
      );

      const refreshResult = await refreshAccessToken(
        settings.baseUrl,
        settings.refreshToken,
      );

      if (!refreshResult.success || !refreshResult.tokens) {
        console.error(
          "[Token Refresher] Failed to refresh token:",
          refreshResult.error,
        );
        return;
      }

      // Update tokens in database
      await bookloreSettingsService.updateTokens(refreshResult.tokens);

      const expiresIn = Math.floor(
        (refreshResult.tokens.accessTokenExpiresAt - Date.now()) / 1000 / 60,
      );
      console.log(
        `[Token Refresher] Token refreshed successfully (access token valid for ${expiresIn} minutes)`,
      );
    } catch (error) {
      console.error("[Token Refresher] Error during token refresh:", error);
    }
  }

  /**
   * Manually trigger a token refresh check (useful for testing)
   */
  async triggerRefresh(): Promise<void> {
    console.log("[Token Refresher] Manual refresh triggered");
    await this.checkAndRefreshToken();
  }
}

// Export singleton instance
export const bookloreTokenRefresher = new BookloreTokenRefresher();
