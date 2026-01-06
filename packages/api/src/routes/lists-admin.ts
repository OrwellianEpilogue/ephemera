import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { importLists, user } from "../db/schema.js";
import { listImportService } from "../services/list-import.js";
import { listSettingsService } from "../services/list-settings.js";
import {
  restartListChecker,
  listCheckerService,
} from "../services/list-checker.js";
import { logger, getErrorMessage } from "../utils/logger.js";
import { errorResponseSchema } from "@ephemera/shared";

const app = new OpenAPIHono();

// ========== Schemas ==========

const listFetchIntervalSchema = z.enum([
  "15min",
  "30min",
  "1h",
  "6h",
  "12h",
  "24h",
]);

const listSettingsSchema = z.object({
  listFetchInterval: listFetchIntervalSchema,
  hardcoverApiToken: z.string().nullable(),
  searchByIsbnFirst: z.boolean(),
  includeYearInSearch: z.boolean(),
  embedMetadataInBooks: z.boolean(),
  updatedAt: z.number(),
});

const updateListSettingsSchema = z.object({
  listFetchInterval: listFetchIntervalSchema.optional(),
  hardcoverApiToken: z.string().nullable().optional(),
  searchByIsbnFirst: z.boolean().optional(),
  includeYearInSearch: z.boolean().optional(),
  embedMetadataInBooks: z.boolean().optional(),
});

const listSourceSchema = z.enum([
  "goodreads",
  "storygraph",
  "hardcover",
  "openlibrary",
  "babelio",
]);

const importListWithUserSchema = z.object({
  id: z.number(),
  userId: z.string(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
  source: listSourceSchema,
  name: z.string(),
  sourceConfig: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  lastFetchedAt: z.number().nullable(),
  fetchError: z.string().nullable(),
  totalBooksImported: z.number(),
  createdAt: z.number(),
});

const listStatsSchema = z.object({
  totalLists: z.number(),
  enabledLists: z.number(),
  totalBooksImported: z.number(),
  listsBySource: z.record(z.string(), z.number()),
  isCheckerRunning: z.boolean(),
});

// ========== Routes ==========

// GET / - Get all lists
const getAllListsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Lists Admin"],
  summary: "Get all import lists (admin only)",
  responses: {
    200: {
      description: "All import lists",
      content: {
        "application/json": {
          schema: z.array(importListWithUserSchema),
        },
      },
    },
  },
});

app.openapi(getAllListsRoute, async (c) => {
  // Join with users table to get user names
  const listsWithUsers = await db
    .select({
      list: importLists,
      userName: user.name,
      userEmail: user.email,
    })
    .from(importLists)
    .leftJoin(user, eq(importLists.userId, user.id))
    .orderBy(importLists.createdAt);

  const formattedLists = listsWithUsers.map(
    ({ list, userName, userEmail }) => ({
      id: list.id,
      userId: list.userId,
      userName: userName ?? undefined,
      userEmail: userEmail ?? undefined,
      source: list.source,
      name: list.name,
      sourceConfig: list.sourceConfig,
      enabled: list.enabled,
      lastFetchedAt: list.lastFetchedAt?.getTime() || null,
      fetchError: list.fetchError,
      totalBooksImported: list.totalBooksImported,
      createdAt: list.createdAt?.getTime() || 0,
    }),
  );

  return c.json(formattedLists);
});

// GET /settings - Get list settings
const getSettingsRoute = createRoute({
  method: "get",
  path: "/settings",
  tags: ["Lists Admin"],
  summary: "Get list import settings (admin only)",
  responses: {
    200: {
      description: "List settings",
      content: {
        "application/json": {
          schema: listSettingsSchema,
        },
      },
    },
  },
});

app.openapi(getSettingsRoute, async (c) => {
  const settings = await listSettingsService.getSettings();

  return c.json({
    listFetchInterval: settings.listFetchInterval,
    // Don't expose full token, just whether it's set
    hardcoverApiToken: settings.hardcoverApiToken ? "••••••••••••" : null,
    searchByIsbnFirst: settings.searchByIsbnFirst,
    includeYearInSearch: settings.includeYearInSearch,
    embedMetadataInBooks: settings.embedMetadataInBooks,
    updatedAt: settings.updatedAt?.getTime() || 0,
  });
});

// PUT /settings - Update list settings
const updateSettingsRoute = createRoute({
  method: "put",
  path: "/settings",
  tags: ["Lists Admin"],
  summary: "Update list import settings (admin only)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateListSettingsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated settings",
      content: {
        "application/json": {
          schema: listSettingsSchema,
        },
      },
    },
    400: {
      description: "Invalid settings",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(updateSettingsRoute, async (c) => {
  try {
    const body = await c.req.json();

    const settings = await listSettingsService.updateSettings(body);

    // If interval changed, restart the checker
    if (body.listFetchInterval) {
      await restartListChecker();
    }

    return c.json(
      {
        listFetchInterval: settings.listFetchInterval,
        hardcoverApiToken: settings.hardcoverApiToken ? "••••••••••••" : null,
        searchByIsbnFirst: settings.searchByIsbnFirst,
        includeYearInSearch: settings.includeYearInSearch,
        embedMetadataInBooks: settings.embedMetadataInBooks,
        updatedAt: settings.updatedAt?.getTime() || 0,
      },
      200,
    );
  } catch (error) {
    logger.error("[Lists Admin] Update settings error:", error);
    return c.json({ error: getErrorMessage(error) }, 400);
  }
});

// GET /stats - Get import statistics
const getStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  tags: ["Lists Admin"],
  summary: "Get list import statistics (admin only)",
  responses: {
    200: {
      description: "Import statistics",
      content: {
        "application/json": {
          schema: listStatsSchema,
        },
      },
    },
  },
});

app.openapi(getStatsRoute, async (c) => {
  const lists = await listImportService.getAllLists();

  const stats = {
    totalLists: lists.length,
    enabledLists: lists.filter((l) => l.enabled).length,
    totalBooksImported: lists.reduce((sum, l) => sum + l.totalBooksImported, 0),
    listsBySource: lists.reduce(
      (acc, l) => {
        acc[l.source] = (acc[l.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    isCheckerRunning: listCheckerService.getStatus().isRunning,
  };

  return c.json(stats);
});

// POST /check-now - Trigger immediate check
const checkNowRoute = createRoute({
  method: "post",
  path: "/check-now",
  tags: ["Lists Admin"],
  summary: "Trigger immediate check of all lists (admin only)",
  responses: {
    200: {
      description: "Check started",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    409: {
      description: "Check already running",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(checkNowRoute, async (c) => {
  if (listCheckerService.getStatus().isRunning) {
    return c.json({ error: "A check is already in progress" }, 409);
  }

  // Start check in background
  listCheckerService.checkAllLists().catch((error) => {
    logger.error("[Lists Admin] Manual check failed:", error);
  });

  return c.json({ message: "Check started" }, 200);
});

export default app;
