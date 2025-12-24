import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeDatabase } from "./db/index.js";
import { logger } from "./utils/logger.js";
import { searchCacheManager } from "./services/search-cache.js";
import { appSettingsService } from "./services/app-settings.js";
import { bookloreSettingsService } from "./services/booklore-settings.js";
import { appriseService } from "./services/apprise.js";
import { bookloreTokenRefresher } from "./services/booklore-token-refresher.js";
import { bookCleanupService } from "./services/book-cleanup.js";
import { requestCheckerService } from "./services/request-checker.js";
import { versionService } from "./services/version.js";
import { indexerSettingsService } from "./services/indexer-settings.js";
import { emailSettingsService } from "./services/email-settings.js";
import searchRoutes from "./routes/search.js";
import downloadRoutes from "./routes/download.js";
import queueRoutes from "./routes/queue.js";
import bookloreRoutes from "./routes/booklore.js";
import settingsRoutes from "./routes/settings.js";
import imageProxyRoutes from "./routes/image-proxy.js";
import requestsRoutes from "./routes/requests.js";
import versionRoutes from "./routes/version.js";
import appriseRoutes from "./routes/apprise.js";
import newznabRoutes from "./routes/newznab.js";
import sabnzbdRoutes from "./routes/sabnzbd.js";
import indexerRoutes from "./routes/indexer.js";
import filesystemRoutes from "./routes/filesystem.js";
import emailRoutes from "./routes/email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get configurable API base path from environment (default: /api)
const API_BASE_PATH = (process.env.API_BASE_PATH || "/api")
  .replace(/\/+$/, "") // Remove trailing slashes
  .replace(/^([^/])/, "/$1"); // Ensure leading slash

// Optional: Set a base URL for the frontend (useful for iframe embedding or subpath hosting)
// Example: If hosting at https://example.com/ephemera/, set HTML_BASE_HREF=/ephemera/
const HTML_BASE_HREF = process.env.HTML_BASE_HREF
  ? process.env.HTML_BASE_HREF.replace(/([^/])$/, "$1/")
  : undefined;

// Filter out undici socket errors from stderr
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
  callback?: (err?: Error | null) => void,
): boolean => {
  const output = chunk.toString();
  // Filter out known network errors from AA
  if (
    output.includes("TypeError: terminated") ||
    output.includes("SocketError: other side closed") ||
    output.includes("UND_ERR_SOCKET")
  ) {
    // Silently ignore these errors
    if (typeof encodingOrCallback === "function") {
      encodingOrCallback();
    } else if (callback) {
      callback();
    }
    return true;
  }

  if (typeof encodingOrCallback === "function") {
    return originalStderrWrite(chunk, encodingOrCallback);
  } else {
    return originalStderrWrite(chunk, encodingOrCallback, callback);
  }
}) as typeof process.stderr.write;

// Initialize database
await initializeDatabase();

// Initialize app settings with defaults
await appSettingsService.initializeDefaults();

// Initialize Booklore settings with defaults
await bookloreSettingsService.initializeDefaults();

// Initialize Apprise settings with defaults
await appriseService.initializeDefaults();

// Initialize Indexer settings with defaults
await indexerSettingsService.getSettings();

// Initialize Email settings with defaults
await emailSettingsService.initializeDefaults();

// Start Booklore token refresher service
bookloreTokenRefresher.start();

// Cleanup expired cache on startup
const cleanedUp = await searchCacheManager.cleanup();
if (cleanedUp > 0) {
  logger.info(`Cleaned up ${cleanedUp} expired cache entries`);
}

// Get current version immediately (doesn't require network)
const versionInfo = await versionService.getVersionInfo();

// Create Hono app with OpenAPI
const app = new OpenAPIHono();

// Middleware
// Custom logger that skips certain requests to reduce log spam
app.use("*", async (c, next) => {
  // Skip logging for image proxy and queue requests
  if (
    c.req.path.includes("/proxy/image") ||
    c.req.path === `${API_BASE_PATH}/queue`
  ) {
    return next();
  }
  // Use hono logger for all other requests
  return honoLogger()(c, next);
});
app.use("*", cors());

// Error handling middleware
app.onError((err, c) => {
  logger.error("Unhandled error:", err);

  return c.json(
    {
      error: "Internal server error",
      message: err.message,
    },
    500,
  );
});

// API info endpoint
app.get(API_BASE_PATH, (c) => {
  return c.json({
    name: "Ephemera API",
    version: "1.1.0",
    description: "API for searching and downloading books from AA",
    apiBasePath: API_BASE_PATH,
    endpoints: {
      search: `${API_BASE_PATH}/search`,
      download: `${API_BASE_PATH}/download/:md5`,
      queue: `${API_BASE_PATH}/queue`,
      history: `${API_BASE_PATH}/history`,
      stats: `${API_BASE_PATH}/stats`,
      settings: `${API_BASE_PATH}/settings`,
      requests: `${API_BASE_PATH}/requests`,
      booklore: `${API_BASE_PATH}/booklore/*`,
      apprise: `${API_BASE_PATH}/apprise/*`,
      email: `${API_BASE_PATH}/email/*`,
      imageProxy: `${API_BASE_PATH}/proxy/image`,
      version: `${API_BASE_PATH}/version`,
      newznab: "/newznab/api",
      sabnzbd: "/sabnzbd/api",
      docs: `${API_BASE_PATH}/docs`,
      openapi: `${API_BASE_PATH}/openapi.json`,
    },
  });
});

// Mount API routes
app.route(API_BASE_PATH, searchRoutes);
app.route(API_BASE_PATH, downloadRoutes);
app.route(API_BASE_PATH, queueRoutes);
app.route(API_BASE_PATH, settingsRoutes);
app.route(API_BASE_PATH, bookloreRoutes);
app.route(API_BASE_PATH, appriseRoutes);
app.route(API_BASE_PATH, imageProxyRoutes);
app.route(API_BASE_PATH, requestsRoutes);
app.route(API_BASE_PATH, versionRoutes);
app.route(API_BASE_PATH, indexerRoutes);
app.route(API_BASE_PATH, filesystemRoutes);
app.route(API_BASE_PATH, emailRoutes);
app.route("/newznab", newznabRoutes);
app.route("/sabnzbd", sabnzbdRoutes);

// OpenAPI documentation
app.doc(`${API_BASE_PATH}/openapi.json`, {
  openapi: "3.1.0",
  info: {
    title: "Ephemera API",
    version: "1.1.0",
    description: "API for searching and downloading books from AA",
    contact: {
      name: "API Support",
    },
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT || 3000}${API_BASE_PATH}`,
      description: "Local development server",
    },
  ],
  tags: [
    {
      name: "Search",
      description: "Search for books",
    },
    {
      name: "Download",
      description: "Queue and manage downloads",
    },
    {
      name: "Queue",
      description: "Monitor download queue and history",
    },
    {
      name: "Requests",
      description:
        "Save and manage book search requests that are checked periodically",
    },
    {
      name: "Settings",
      description: "Application settings and configuration",
    },
    {
      name: "Booklore",
      description:
        "Optional Booklore integration for uploading books to your library",
    },
    {
      name: "Email",
      description: "Send downloaded books via email to configured recipients",
    },
    {
      name: "Image Proxy",
      description: "Proxy images from AA to protect client IP addresses",
    },
    {
      name: "Version",
      description: "Application version information and update checks",
    },
  ],
});

// Swagger UI
app.get(
  `${API_BASE_PATH}/docs`,
  swaggerUI({ url: `${API_BASE_PATH}/openapi.json` }),
);

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve static files from the web build (for production/Docker)
// In development, Vite serves these files
const webDistPath = join(__dirname, "../../web/dist");
if (existsSync(webDistPath)) {
  logger.info(`Serving static files from: ${webDistPath}`);

  // Serve static assets with caching
  app.use(
    "/*",
    serveStatic({
      root: webDistPath,
    }),
  );

  // SPA fallback - serve index.html for all non-API routes
  app.get("*", (c) => {
    const path = c.req.path;
    // Skip API routes and health check
    if (path.startsWith(`${API_BASE_PATH}/`) || path === "/health") {
      return c.notFound();
    }

    // Serve index.html for SPA routing
    const indexPath = join(webDistPath, "index.html");
    if (existsSync(indexPath)) {
      let html = readFileSync(indexPath, "utf-8");

      // Inject API base path as a meta tag for frontend to use
      let injections = `<meta name="api-base-path" content="${API_BASE_PATH}" />`;

      // Optionally inject HTML <base> tag for iframe embedding or subpath hosting
      if (HTML_BASE_HREF) {
        injections = `<base href="${HTML_BASE_HREF}" />\n    ${injections}`;
      }

      html = html.replace("</head>", `${injections}</head>`);

      return c.html(html);
    }

    return c.notFound();
  });
} else {
  logger.warn(
    `Web build not found at ${webDistPath} - skipping static file serving`,
  );
  logger.warn("For development, use: pnpm dev");
}

// Cleanup cache periodically (every hour)
setInterval(
  async () => {
    try {
      const cleaned = await searchCacheManager.cleanup();
      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired cache entries`);
      }
    } catch (error) {
      logger.error("Failed to cleanup cache:", error);
    }
  },
  60 * 60 * 1000,
);

// Cleanup old books and downloads periodically (every 24 hours)
setInterval(
  async () => {
    try {
      const cleaned = await bookCleanupService.cleanupAll();
      const total = cleaned.books + cleaned.downloads;
      if (total > 0) {
        logger.info(
          `Cleaned up ${cleaned.books} old books and ${cleaned.downloads} old downloads from database`,
        );
      }
    } catch (error) {
      logger.error("Failed to cleanup old data:", error);
    }
  },
  24 * 60 * 60 * 1000,
);

// Helper to convert request check interval to milliseconds
function getIntervalMs(interval: string): number {
  const intervals: Record<string, number> = {
    "1min": 60 * 1000,
    "15min": 15 * 60 * 1000,
    "30min": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
  };
  return intervals[interval] || intervals["6h"]; // default to 6h
}

// Check download requests periodically based on settings
let requestCheckerInterval: NodeJS.Timeout | null = null;

export async function startRequestChecker() {
  try {
    const settings = await appSettingsService.getSettings();
    const intervalMs = getIntervalMs(settings.requestCheckInterval);

    logger.info(
      `Starting request checker with interval: ${settings.requestCheckInterval}`,
    );

    // Clear existing interval if any
    if (requestCheckerInterval) {
      clearInterval(requestCheckerInterval);
    }

    // Run immediately on startup
    await requestCheckerService.checkAllRequests();

    // Then run periodically
    requestCheckerInterval = setInterval(async () => {
      try {
        await requestCheckerService.checkAllRequests();
      } catch (error) {
        logger.error("Failed to check download requests:", error);
      }
    }, intervalMs);
  } catch (error) {
    logger.error("Failed to start request checker:", error);
  }
}

// Start request checker
startRequestChecker();

// Start server
const port = parseInt(process.env.PORT || "3000");
const host = process.env.HOST || "0.0.0.0";

const servingStatic = existsSync(webDistPath);

// Log API base path configuration if non-default
if (API_BASE_PATH !== "/api") {
  logger.info(`Using custom API base path: ${API_BASE_PATH}`);
}

logger.success(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   Ephemera v${versionInfo.currentVersion} is running!${" ".repeat(25 - versionInfo.currentVersion.length)}║
║                                                   ║
${versionInfo.updateAvailable && versionInfo.latestVersion ? `║   📦 Update available: ${versionInfo.latestVersion}${" ".repeat(23 - versionInfo.latestVersion.length)}║\n║                                                   ║\n` : ""}${servingStatic ? `║   Web:     http://${host}:${port}/                   ║\n` : ""}║   API:     http://${host}:${port}${API_BASE_PATH}${" ".repeat(17 - API_BASE_PATH.length)}║
║   Docs:    http://${host}:${port}${API_BASE_PATH}/docs${" ".repeat(12 - API_BASE_PATH.length)}║
║   Health:  http://${host}:${port}/health             ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`);

const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

// Check for updates in background (non-blocking)
// This doesn't delay server startup since it runs asynchronously
(async () => {
  try {
    // Force a fresh check (bypassing any stale cache from initialization)
    const freshVersionInfo = await versionService.getVersionInfo();
    logger.info(`Current version: v${freshVersionInfo.currentVersion}`);

    if (freshVersionInfo.updateAvailable && freshVersionInfo.latestVersion) {
      logger.warn(`Update available: ${freshVersionInfo.latestVersion}`);
      logger.info(`Download: ${freshVersionInfo.releaseUrl}`);

      // Send Apprise notification if enabled
      await appriseService.send("update_available", {
        currentVersion: freshVersionInfo.currentVersion,
        latestVersion: freshVersionInfo.latestVersion,
        releaseUrl: freshVersionInfo.releaseUrl,
      });
    }
  } catch (error) {
    // Silently fail - version checks shouldn't break the app
    logger.debug("Failed to check for updates:", error);
  }
})();

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop background services
    bookloreTokenRefresher.stop();

    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after 5 seconds
    setTimeout(() => {
      logger.warn("Forcing shutdown after timeout");
      process.exit(1);
    }, 5000);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle unhandled promise rejections (e.g., socket errors from AA)
process.on("unhandledRejection", (reason, _promise) => {
  // Only log non-network errors
  const errorMessage = String(reason);
  const isNetworkError =
    errorMessage.includes("terminated") ||
    errorMessage.includes("socket") ||
    errorMessage.includes("UND_ERR_SOCKET") ||
    errorMessage.includes("ECONNREFUSED");

  if (!isNetworkError) {
    logger.error("Unhandled rejection:", reason);
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  // Don't exit on network errors
  const isNetworkError =
    error.message?.includes("terminated") ||
    error.message?.includes("socket") ||
    error.message?.includes("UND_ERR_SOCKET");

  if (!isNetworkError) {
    process.exit(1);
  }
});
