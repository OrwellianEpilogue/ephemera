import { createMiddleware } from "hono/factory";
import { flareSolverrHealthService } from "../services/flaresolverr-health.js";

/**
 * Middleware to block requests during maintenance mode
 * Returns 503 Service Unavailable when FlareSolverr is down and no API key is configured
 */
export const maintenanceGuard = createMiddleware(async (c, next) => {
  const status = flareSolverrHealthService.getStatus();

  if (status.inMaintenanceMode) {
    return c.json(
      {
        error: "Service Unavailable",
        message:
          status.reason ||
          "The service is temporarily unavailable. Please try again later.",
        maintenanceMode: true,
      },
      503,
    );
  }

  return await next();
});
