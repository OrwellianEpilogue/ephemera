import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { queueManager } from "../services/queue-manager.js";
import { downloadTracker } from "../services/download-tracker.js";
import { downloader } from "../services/downloader.js";
import {
  queueResponseSchema,
  queueItemSchema,
  statsResponseSchema,
  errorResponseSchema,
  type QueueResponse,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";

const app = new OpenAPIHono();

// Get all queue status
const queueStatusRoute = createRoute({
  method: "get",
  path: "/queue",
  tags: ["Queue"],
  summary: "Get download queue status",
  description:
    "Get the status of all downloads grouped by status (available, queued, downloading, done, error, cancelled)",
  responses: {
    200: {
      description: "Queue status",
      content: {
        "application/json": {
          schema: queueResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(queueStatusRoute, async (c) => {
  try {
    const status = await queueManager.getQueueStatus();
    return c.json(status, 200);
  } catch (error: unknown) {
    logger.error("Queue status error:", error);

    return c.json(
      {
        error: "Failed to get queue status",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// SSE streaming endpoint for real-time queue updates
// IMPORTANT: Must come BEFORE /queue/{md5} route to avoid "stream" being interpreted as md5
const queueStreamRoute = createRoute({
  method: "get",
  path: "/queue/stream",
  tags: ["Queue"],
  summary: "Stream real-time queue updates (SSE)",
  description:
    "Subscribe to real-time queue status updates using Server-Sent Events. The connection will send updates whenever the queue state changes.",
  responses: {
    200: {
      description: "SSE stream of queue updates",
      content: {
        "text/event-stream": {
          schema: z.object({
            event: z.string().describe("Event type: queue-update or ping"),
            data: z.string().describe("JSON-encoded queue data"),
            id: z.string().optional().describe("Event ID"),
          }),
        },
      },
    },
  },
});

app.openapi(queueStreamRoute, async (c) => {
  return streamSSE(c, async (stream) => {
    let eventId = 0;
    const clientId = Math.random().toString(36).substring(7);
    let isActive = true;

    logger.info(`[SSE] Client ${clientId} connected`);

    // Send initial queue state
    const initialStatus = await queueManager.getQueueStatus();
    await stream.writeSSE({
      data: JSON.stringify(initialStatus),
      event: "queue-update",
      id: String(eventId++),
    });

    // Listen for queue updates
    const updateHandler = async (status: QueueResponse) => {
      if (!isActive) return;

      try {
        await stream.writeSSE({
          data: JSON.stringify(status),
          event: "queue-update",
          id: String(eventId++),
        });
      } catch (error) {
        logger.error(
          `[SSE] Failed to send update to client ${clientId}:`,
          error,
        );
        isActive = false;
      }
    };

    queueManager.on("queue-updated", updateHandler);

    // Heartbeat to keep connection alive (every 30 seconds)
    const heartbeatInterval = setInterval(async () => {
      if (!isActive) {
        clearInterval(heartbeatInterval);
        return;
      }

      try {
        await stream.writeSSE({
          data: JSON.stringify({ timestamp: Date.now() }),
          event: "ping",
          id: String(eventId++),
        });
      } catch (error) {
        logger.error(`[SSE] Heartbeat failed for client ${clientId}:`, error);
        isActive = false;
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Keep connection open by checking abort signal
    try {
      while (isActive && !c.req.raw.signal.aborted) {
        await stream.sleep(1000);
      }
    } catch (error) {
      logger.error(`[SSE] Stream error for client ${clientId}:`, error);
    } finally {
      // Cleanup
      isActive = false;
      clearInterval(heartbeatInterval);
      queueManager.off("queue-updated", updateHandler);
      logger.info(`[SSE] Client ${clientId} disconnected`);
    }
  });
});

// Get specific download status
const downloadStatusRoute = createRoute({
  method: "get",
  path: "/queue/{md5}",
  tags: ["Queue"],
  summary: "Get download status by MD5",
  description: "Get detailed status of a specific download",
  request: {
    params: z.object({
      md5: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .describe("MD5 hash of the book"),
    }),
  },
  responses: {
    200: {
      description: "Download status",
      content: {
        "application/json": {
          schema: queueItemSchema,
        },
      },
    },
    404: {
      description: "Download not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadStatusRoute, async (c) => {
  try {
    const { md5 } = c.req.valid("param");

    const status = await queueManager.getDownloadStatus(md5);

    if (!status) {
      return c.json(
        {
          error: "Download not found",
          code: "NOT_FOUND",
        },
        404,
      );
    }

    return c.json(status, 200);
  } catch (error: unknown) {
    logger.error("Download status error:", error);

    return c.json(
      {
        error: "Failed to get download status",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Get statistics
const statsRoute = createRoute({
  method: "get",
  path: "/stats",
  tags: ["Queue"],
  summary: "Get download statistics",
  description: "Get overall statistics about downloads",
  responses: {
    200: {
      description: "Download statistics",
      content: {
        "application/json": {
          schema: statsResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(statsRoute, async (c) => {
  try {
    const stats = await downloadTracker.getStats();

    // Optional: Include Booklore upload stats if any uploads have been tracked
    let uploadStats;
    try {
      const pending = await downloadTracker.getByUploadStatus("pending");
      const uploading = await downloadTracker.getByUploadStatus("uploading");
      const completed = await downloadTracker.getByUploadStatus("completed");
      const failed = await downloadTracker.getByUploadStatus("failed");

      const totalUploads =
        pending.length + uploading.length + completed.length + failed.length;

      // Only include upload stats if there have been any uploads
      if (totalUploads > 0) {
        uploadStats = {
          pending: pending.length,
          uploading: uploading.length,
          completed: completed.length,
          failed: failed.length,
        };
      }
    } catch (_error) {
      // Upload stats are optional, ignore errors
    }

    return c.json(
      {
        total: stats.total,
        available: stats.available,
        downloading: stats.downloading,
        queued: stats.queued,
        errors: stats.errors,
        totalSize: downloader.formatSize(stats.totalSize),
        successRate: parseFloat(stats.successRate.toFixed(2)),
        ...(uploadStats && { uploads: uploadStats }),
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Stats error:", error);

    return c.json(
      {
        error: "Failed to get statistics",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

export default app;
