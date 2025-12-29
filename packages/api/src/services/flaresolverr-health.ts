import { appConfigService } from "./app-config.js";
import { appriseService } from "./apprise.js";

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL;
const DISABLE_MAINTENANCE_MODE =
  process.env.DISABLE_MAINTENANCE_MODE === "true";
const CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds
const HEALTH_CHECK_TIMEOUT_MS = 5000; // 5 second timeout

export interface MaintenanceStatus {
  inMaintenanceMode: boolean;
  reason: string | null;
  flareSolverrConfigured: boolean;
  flareSolverrAvailable: boolean;
  lastCheckedAt: number;
}

/**
 * FlareSolverr Health Service
 * Periodically checks FlareSolverr availability and determines if app should be in maintenance mode.
 *
 * Maintenance mode is triggered when ALL conditions are met:
 * 1. FLARESOLVERR_URL is configured (env var set)
 * 2. FlareSolverr is NOT available (health check fails)
 * 3. No AA API key is configured (searcherApiKey is empty)
 * 4. Setup is complete (isSetupComplete === true)
 */
class FlareSolverrHealthService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private currentStatus: MaintenanceStatus = {
    inMaintenanceMode: false,
    reason: null,
    flareSolverrConfigured: !!FLARESOLVERR_URL,
    flareSolverrAvailable: true, // Assume available until first check
    lastCheckedAt: 0,
  };

  /**
   * Start the health check background service
   */
  start(): void {
    if (DISABLE_MAINTENANCE_MODE) {
      console.log(
        "[FlareSolverr Health] Maintenance mode disabled via DISABLE_MAINTENANCE_MODE env var",
      );
      return;
    }

    if (this.isRunning) {
      console.log("[FlareSolverr Health] Already running");
      return;
    }

    console.log(
      `[FlareSolverr Health] Starting health check service (interval: ${CHECK_INTERVAL_MS / 1000}s)`,
    );

    if (!FLARESOLVERR_URL) {
      console.log(
        "[FlareSolverr Health] FLARESOLVERR_URL not configured, service will not check availability",
      );
    }

    // Run immediately on start
    this.checkAndUpdateStatus().catch((error) => {
      console.error(
        "[FlareSolverr Health] Error during initial health check:",
        error,
      );
    });

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndUpdateStatus().catch((error) => {
        console.error(
          "[FlareSolverr Health] Error during scheduled health check:",
          error,
        );
      });
    }, CHECK_INTERVAL_MS);

    this.isRunning = true;
  }

  /**
   * Stop the health check background service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log("[FlareSolverr Health] Stopped");
    }
  }

  /**
   * Get current maintenance status synchronously
   * Used by middleware to check if requests should be blocked
   */
  getStatus(): MaintenanceStatus {
    // Always return non-maintenance when disabled
    if (DISABLE_MAINTENANCE_MODE) {
      return {
        inMaintenanceMode: false,
        reason: null,
        flareSolverrConfigured: !!FLARESOLVERR_URL,
        flareSolverrAvailable: true,
        lastCheckedAt: Date.now(),
      };
    }
    return { ...this.currentStatus };
  }

  /**
   * Check FlareSolverr health endpoint
   */
  private async checkFlareSolverrHealth(): Promise<boolean> {
    if (!FLARESOLVERR_URL) {
      return true; // Not configured = not a blocker
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        HEALTH_CHECK_TIMEOUT_MS,
      );

      const response = await fetch(`${FLARESOLVERR_URL}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      // Network error, timeout, or abort
      return false;
    }
  }

  /**
   * Check health and update maintenance status
   */
  private async checkAndUpdateStatus(): Promise<void> {
    try {
      // If FlareSolverr not configured, no maintenance mode needed
      if (!FLARESOLVERR_URL) {
        this.currentStatus = {
          inMaintenanceMode: false,
          reason: null,
          flareSolverrConfigured: false,
          flareSolverrAvailable: true,
          lastCheckedAt: Date.now(),
        };
        return;
      }

      const config = await appConfigService.getConfig();

      // If setup not complete, no maintenance mode
      if (!config.isSetupComplete) {
        this.currentStatus = {
          inMaintenanceMode: false,
          reason: null,
          flareSolverrConfigured: true,
          flareSolverrAvailable: this.currentStatus.flareSolverrAvailable,
          lastCheckedAt: Date.now(),
        };
        return;
      }

      // If API key is set, downloads can work without FlareSolverr
      if (config.searcherApiKey) {
        this.currentStatus = {
          inMaintenanceMode: false,
          reason: null,
          flareSolverrConfigured: true,
          flareSolverrAvailable: this.currentStatus.flareSolverrAvailable,
          lastCheckedAt: Date.now(),
        };
        // Still check FlareSolverr availability for status reporting
        const isAvailable = await this.checkFlareSolverrHealth();
        this.currentStatus.flareSolverrAvailable = isAvailable;
        return;
      }

      // FlareSolverr is the only download method - check availability
      const isAvailable = await this.checkFlareSolverrHealth();
      const wasInMaintenance = this.currentStatus.inMaintenanceMode;

      if (!isAvailable) {
        this.currentStatus = {
          inMaintenanceMode: true,
          reason:
            "FlareSolverr is unavailable and no API key is configured. Search and downloads are temporarily disabled.",
          flareSolverrConfigured: true,
          flareSolverrAvailable: false,
          lastCheckedAt: Date.now(),
        };

        if (!wasInMaintenance) {
          console.warn(
            "[FlareSolverr Health] Entering maintenance mode - FlareSolverr unavailable",
          );

          // Send notification for service becoming unhealthy
          await appriseService.send("service_unhealthy", {
            reason:
              "FlareSolverr is unavailable and no API key is configured for fallback",
          });
        }
      } else {
        this.currentStatus = {
          inMaintenanceMode: false,
          reason: null,
          flareSolverrConfigured: true,
          flareSolverrAvailable: true,
          lastCheckedAt: Date.now(),
        };

        if (wasInMaintenance) {
          console.log(
            "[FlareSolverr Health] Exiting maintenance mode - FlareSolverr available",
          );

          // Send notification for service recovery
          await appriseService.send("service_recovered", {});
        }
      }
    } catch (error) {
      console.error("[FlareSolverr Health] Error during status check:", error);
      // On error, keep previous status to avoid flapping
    }
  }

  /**
   * Manually trigger a health check (useful for testing)
   */
  async triggerCheck(): Promise<MaintenanceStatus> {
    await this.checkAndUpdateStatus();
    return this.getStatus();
  }
}

// Export singleton instance
export const flareSolverrHealthService = new FlareSolverrHealthService();
