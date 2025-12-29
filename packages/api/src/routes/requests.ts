import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { downloadRequestsService } from "../services/download-requests.js";
import {
  requestsManager,
  type RequestsUpdate,
} from "../services/requests-manager.js";
import {
  errorResponseSchema,
  createRequestInputSchema,
  savedRequestWithMetadataSchema,
} from "@ephemera/shared";
import { logger, getErrorMessage } from "../utils/logger.js";
import { permissionsService } from "../services/permissions.js";
import { appriseService } from "../services/apprise.js";
import { requestCheckerService } from "../services/request-checker.js";

const app = new OpenAPIHono();

// Create request route
const createRequestRoute = createRoute({
  method: "post",
  path: "/requests",
  tags: ["Requests"],
  summary: "Create a new download request",
  description:
    "Save a book search to be checked periodically for new results. If targetBookMd5 is provided, that specific book will be downloaded when approved (skips search).",
  request: {
    body: {
      content: {
        "application/json": {
          schema: createRequestInputSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successfully created request",
      content: {
        "application/json": {
          schema: savedRequestWithMetadataSchema,
        },
      },
    },
    400: {
      description: "Invalid parameters",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    409: {
      description:
        "Duplicate request - an active request with these parameters already exists",
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

app.openapi(createRequestRoute, async (c) => {
  try {
    const user = c.get("user"); // Set by requireAuth middleware

    const body = await c.req.json();
    const { targetBookMd5, ...queryParams } = body;

    // Check if user has permission to start downloads directly
    const isAdmin = user.role === "admin";
    const canStartDownloads =
      isAdmin ||
      (await permissionsService.canPerform(user.id, "canStartDownloads"));

    logger.info(
      `Creating download request for query: ${queryParams.q} by user ${user.id} (canStartDownloads: ${canStartDownloads})${targetBookMd5 ? `, targetMd5: ${targetBookMd5}` : ""}`,
    );

    const request = await requestsManager.createRequest(
      queryParams,
      user.id,
      canStartDownloads,
      targetBookMd5,
    );

    // Send notification for new request
    await appriseService.send("new_request", {
      query: queryParams.q,
      title: queryParams.title,
      author: queryParams.author,
      username: user.name || user.email,
    });

    // If request needs approval, send notification to managers
    if (!canStartDownloads) {
      await appriseService.send("request_pending_approval", {
        requesterName: user.name || user.email,
        query: queryParams.q,
        title: queryParams.title,
        author: queryParams.author,
      });
    }

    return c.json(request, 200);
  } catch (error: unknown) {
    logger.error("Create request error:", error);

    const errorMessage = getErrorMessage(error);

    if (
      errorMessage.includes("duplicate") ||
      errorMessage.includes("already exists")
    ) {
      return c.json(
        {
          error: "Duplicate request",
          details: errorMessage,
        },
        409,
      );
    }

    return c.json(
      {
        error: "Failed to create request",
        details: errorMessage,
      },
      500,
    );
  }
});

// List requests route
const listRequestsRoute = createRoute({
  method: "get",
  path: "/requests",
  tags: ["Requests"],
  summary: "List all download requests",
  description: "Get all saved download requests with optional status filter",
  request: {
    query: z.object({
      status: z
        .enum([
          "pending_approval",
          "active",
          "fulfilled",
          "cancelled",
          "rejected",
        ])
        .optional()
        .describe("Filter by status"),
    }),
  },
  responses: {
    200: {
      description: "List of requests",
      content: {
        "application/json": {
          schema: z.array(savedRequestWithMetadataSchema),
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

app.openapi(listRequestsRoute, async (c) => {
  try {
    const { status } = c.req.query();

    logger.info(`Listing requests${status ? ` (status: ${status})` : ""}`);

    const requests = await downloadRequestsService.getAllRequests(
      status as
        | "pending_approval"
        | "active"
        | "fulfilled"
        | "cancelled"
        | "rejected"
        | undefined,
    );

    return c.json(requests, 200);
  } catch (error: unknown) {
    logger.error("List requests error:", error);

    return c.json(
      {
        error: "Failed to list requests",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// SSE streaming endpoint for real-time request updates
// IMPORTANT: Must come BEFORE /requests/stats route to avoid "stream" being interpreted as stats
const requestsStreamRoute = createRoute({
  method: "get",
  path: "/requests/stream",
  tags: ["Requests"],
  summary: "Stream real-time request updates (SSE)",
  description:
    "Subscribe to real-time request and stats updates using Server-Sent Events. The connection will send updates whenever requests or stats change.",
  responses: {
    200: {
      description: "SSE stream of request updates",
      content: {
        "text/event-stream": {
          schema: z.object({
            event: z.string().describe("Event type: requests-updated or ping"),
            data: z.string().describe("JSON-encoded requests and stats data"),
            id: z.string().optional().describe("Event ID"),
          }),
        },
      },
    },
  },
});

app.openapi(requestsStreamRoute, async (c) => {
  return streamSSE(c, async (stream) => {
    let eventId = 0;
    const clientId = Math.random().toString(36).substring(7);
    let isActive = true;

    logger.info(`[SSE] Requests client ${clientId} connected`);

    // Send initial state (requests + stats)
    const initialState = await requestsManager.getFullUpdate();
    await stream.writeSSE({
      data: JSON.stringify(initialState),
      event: "requests-updated",
      id: String(eventId++),
    });

    // Listen for request updates
    const updateHandler = async (update: RequestsUpdate) => {
      if (!isActive) return;

      try {
        await stream.writeSSE({
          data: JSON.stringify(update),
          event: "requests-updated",
          id: String(eventId++),
        });
      } catch (error) {
        logger.error(
          `[SSE] Failed to send update to requests client ${clientId}:`,
          error,
        );
        isActive = false;
      }
    };

    requestsManager.on("requests-updated", updateHandler);

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
        logger.error(
          `[SSE] Heartbeat failed for requests client ${clientId}:`,
          error,
        );
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
      logger.error(
        `[SSE] Stream error for requests client ${clientId}:`,
        error,
      );
    } finally {
      // Cleanup
      isActive = false;
      clearInterval(heartbeatInterval);
      requestsManager.off("requests-updated", updateHandler);
      logger.info(`[SSE] Requests client ${clientId} disconnected`);
    }
  });
});

// Get stats route
const getStatsRoute = createRoute({
  method: "get",
  path: "/requests/stats",
  tags: ["Requests"],
  summary: "Get request statistics",
  description: "Get counts of requests by status",
  responses: {
    200: {
      description: "Request statistics",
      content: {
        "application/json": {
          schema: z.object({
            pending_approval: z
              .number()
              .describe("Number of requests pending approval"),
            active: z.number().describe("Number of active requests"),
            fulfilled: z.number().describe("Number of fulfilled requests"),
            cancelled: z.number().describe("Number of cancelled requests"),
            rejected: z.number().describe("Number of rejected requests"),
            total: z.number().describe("Total number of requests"),
          }),
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

app.openapi(getStatsRoute, async (c) => {
  try {
    const stats = await downloadRequestsService.getStats();
    return c.json(stats, 200);
  } catch (error: unknown) {
    logger.error("Get stats error:", error);

    return c.json(
      {
        error: "Failed to get stats",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Delete request route
const deleteRequestRoute = createRoute({
  method: "delete",
  path: "/requests/{id}",
  tags: ["Requests"],
  summary: "Delete a download request",
  description: "Permanently remove a download request",
  request: {
    params: z.object({
      id: z.string().transform(Number).describe("Request ID"),
    }),
  },
  responses: {
    200: {
      description: "Successfully deleted",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    403: {
      description: "Forbidden - not owner and lacks permission",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Request not found",
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

app.openapi(deleteRequestRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");
    const user = c.get("user");

    // Get the request to check ownership
    const request = await downloadRequestsService.getRequestById(id);

    if (!request) {
      return c.json(
        {
          error: "Request not found",
          details: `No request found with ID: ${id}`,
        },
        404,
      );
    }

    // Check ownership OR permission
    const isOwner = request.userId === user.id;
    const isAdmin = user.role === "admin";
    const hasPermission =
      isAdmin ||
      (await permissionsService.canPerform(user.id, "canManageRequests"));

    if (!isOwner && !hasPermission) {
      return c.json(
        {
          error: "Forbidden",
          message: "You can only delete your own requests",
        },
        403,
      );
    }

    logger.info(`Deleting request: ${id} by user ${user.id}`);

    await requestsManager.deleteRequest(id);

    return c.json(
      {
        success: true,
        message: "Request deleted successfully",
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Delete request error:", error);

    return c.json(
      {
        error: "Failed to delete request",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Approve request route
const approveRequestRoute = createRoute({
  method: "post",
  path: "/requests/{id}/approve",
  tags: ["Requests"],
  summary: "Approve a pending request",
  description:
    "Approve a request that is pending approval. Requires canManageRequests permission.",
  request: {
    params: z.object({
      id: z.string().transform(Number).describe("Request ID"),
    }),
  },
  responses: {
    200: {
      description: "Request approved",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: "Request not pending approval",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - lacks canManageRequests permission",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Request not found",
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

app.openapi(approveRequestRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");
    const user = c.get("user");

    // Check permission
    const isAdmin = user.role === "admin";
    const hasPermission =
      isAdmin ||
      (await permissionsService.canPerform(user.id, "canManageRequests"));

    if (!hasPermission) {
      return c.json(
        {
          error: "Forbidden",
          message: "You do not have permission to approve requests",
        },
        403,
      );
    }

    // Get the request
    const request = await downloadRequestsService.getRequestById(id);

    if (!request) {
      return c.json(
        {
          error: "Request not found",
          details: `No request found with ID: ${id}`,
        },
        404,
      );
    }

    if (request.status !== "pending_approval") {
      return c.json(
        {
          error: "Invalid status",
          details: "Only pending_approval requests can be approved",
        },
        400,
      );
    }

    logger.info(`Approving request: ${id} by user ${user.id}`);

    await requestsManager.approveRequest(id, user.id);

    // Notify the requester
    await appriseService.send("request_approved", {
      query: request.queryParams.q,
      title: request.queryParams.title,
      author: request.queryParams.author,
    });

    // Immediately process the request (don't wait for cron)
    // Run async without blocking the response
    requestCheckerService.checkSingleRequest(id).then((result) => {
      if (result.found) {
        logger.info(
          `Request ${id} immediately fulfilled with book ${result.bookMd5}`,
        );
      } else if (result.error) {
        logger.warn(`Request ${id} immediate check failed: ${result.error}`);
      } else {
        logger.info(`Request ${id} checked - no results yet`);
      }
    });

    return c.json(
      {
        success: true,
        message: "Request approved and processing started",
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Approve request error:", error);

    return c.json(
      {
        error: "Failed to approve request",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// Reject request route
const rejectRequestRoute = createRoute({
  method: "post",
  path: "/requests/{id}/reject",
  tags: ["Requests"],
  summary: "Reject a pending request",
  description:
    "Reject a request that is pending approval. Requires canManageRequests permission.",
  request: {
    params: z.object({
      id: z.string().transform(Number).describe("Request ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            reason: z.string().optional().describe("Reason for rejection"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Request rejected",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: "Request not pending approval",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - lacks canManageRequests permission",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Request not found",
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

app.openapi(rejectRequestRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const reason = body.reason as string | undefined;

    // Check permission
    const isAdmin = user.role === "admin";
    const hasPermission =
      isAdmin ||
      (await permissionsService.canPerform(user.id, "canManageRequests"));

    if (!hasPermission) {
      return c.json(
        {
          error: "Forbidden",
          message: "You do not have permission to reject requests",
        },
        403,
      );
    }

    // Get the request
    const request = await downloadRequestsService.getRequestById(id);

    if (!request) {
      return c.json(
        {
          error: "Request not found",
          details: `No request found with ID: ${id}`,
        },
        404,
      );
    }

    if (request.status !== "pending_approval") {
      return c.json(
        {
          error: "Invalid status",
          details: "Only pending_approval requests can be rejected",
        },
        400,
      );
    }

    logger.info(`Rejecting request: ${id} by user ${user.id}`);

    await requestsManager.rejectRequest(id, user.id, reason);

    // Notify the requester
    await appriseService.send("request_rejected", {
      query: request.queryParams.q,
      title: request.queryParams.title,
      author: request.queryParams.author,
      reason,
    });

    return c.json(
      {
        success: true,
        message: "Request rejected successfully",
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("Reject request error:", error);

    return c.json(
      {
        error: "Failed to reject request",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

export default app;
