import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { downloadRequestsService } from "../services/download-requests.js";
import {
  errorResponseSchema,
  requestQueryParamsSchema,
  savedRequestWithBookSchema,
} from "@ephemera/shared";
import { logger, getErrorMessage } from "../utils/logger.js";

const app = new OpenAPIHono();

// Create request route
const createRequestRoute = createRoute({
  method: "post",
  path: "/requests",
  tags: ["Requests"],
  summary: "Create a new download request",
  description: "Save a book search to be checked periodically for new results",
  request: {
    body: {
      content: {
        "application/json": {
          schema: requestQueryParamsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successfully created request",
      content: {
        "application/json": {
          schema: savedRequestWithBookSchema,
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
    const queryParams = await c.req.json();

    logger.info(`Creating download request for query: ${queryParams.q}`);

    const request = await downloadRequestsService.createRequest(queryParams);

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
        .enum(["active", "fulfilled", "cancelled"])
        .optional()
        .describe("Filter by status"),
    }),
  },
  responses: {
    200: {
      description: "List of requests",
      content: {
        "application/json": {
          schema: z.array(savedRequestWithBookSchema),
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
      status as "active" | "fulfilled" | "cancelled" | undefined,
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
            active: z.number().describe("Number of active requests"),
            fulfilled: z.number().describe("Number of fulfilled requests"),
            cancelled: z.number().describe("Number of cancelled requests"),
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

    logger.info(`Deleting request: ${id}`);

    await downloadRequestsService.deleteRequest(id);

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

export default app;
