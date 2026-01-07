import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { listImportService } from "../services/list-import.js";
import { listSettingsService } from "../services/list-settings.js";
import {
  getFetcher,
  listSources,
  type ListSource,
} from "../services/list-fetchers/index.js";
import { flareSolverrHealthService } from "../services/flaresolverr-health.js";
import { logger, getErrorMessage } from "../utils/logger.js";
import { errorResponseSchema } from "@ephemera/shared";

const app = new OpenAPIHono();

// ========== Schemas ==========

const listSourceSchema = z.enum([
  "goodreads",
  "storygraph",
  "hardcover",
  "openlibrary",
  "babelio",
]);
const listImportModeSchema = z.enum(["all", "future"]);

const importListSchema = z.object({
  id: z.number(),
  userId: z.string(),
  source: listSourceSchema,
  name: z.string(),
  sourceConfig: z.record(z.string(), z.unknown()),
  searchDefaults: z
    .object({
      lang: z.array(z.string()).optional(),
      ext: z.array(z.string()).optional(),
      content: z.array(z.string()).optional(),
      sort: z.string().optional(),
    })
    .nullable(),
  importMode: listImportModeSchema,
  useBookLanguage: z.boolean(),
  enabled: z.boolean(),
  lastFetchedAt: z.number().nullable(),
  fetchError: z.string().nullable(),
  totalBooksImported: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const createListInputSchema = z.object({
  source: listSourceSchema,
  name: z.string().min(1).max(100),
  sourceConfig: z.record(z.string(), z.unknown()),
  searchDefaults: z
    .object({
      lang: z.array(z.string()).optional(),
      ext: z.array(z.string()).optional(),
      content: z.array(z.string()).optional(),
      sort: z.string().optional(),
    })
    .optional(),
  importMode: listImportModeSchema.optional().default("future"),
  useBookLanguage: z.boolean().optional().default(true),
});

const updateListInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sourceConfig: z.record(z.string(), z.unknown()).optional(),
  searchDefaults: z
    .object({
      lang: z.array(z.string()).optional(),
      ext: z.array(z.string()).optional(),
      content: z.array(z.string()).optional(),
      sort: z.string().optional(),
    })
    .optional(),
  enabled: z.boolean().optional(),
  useBookLanguage: z.boolean().optional(),
});

const listSourceInfoSchema = z.object({
  id: listSourceSchema,
  name: z.string(),
  description: z.string(),
  requiresApiKey: z.boolean(),
  requiresFlareSolverr: z.boolean(),
});

const availableListSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
});

const processResultSchema = z.object({
  newBooks: z.number(),
  totalBooks: z.number(),
  error: z.string().optional(),
});

// ========== Routes ==========
// IMPORTANT: Static routes MUST be registered before parameterized routes
// Otherwise /lists/sources would match /lists/{id} with id="sources"

// GET /lists - Get user's lists
const getListsRoute = createRoute({
  method: "get",
  path: "/lists",
  tags: ["Lists"],
  summary: "Get user's import lists",
  responses: {
    200: {
      description: "List of import lists",
      content: {
        "application/json": {
          schema: z.array(importListSchema),
        },
      },
    },
  },
});

app.openapi(getListsRoute, async (c) => {
  const user = c.get("user");
  const lists = await listImportService.getListsForUser(user.id);

  // Convert dates to timestamps for JSON
  const formattedLists = lists.map((list) => ({
    ...list,
    createdAt: list.createdAt?.getTime() || 0,
    updatedAt: list.updatedAt?.getTime() || 0,
    lastFetchedAt: list.lastFetchedAt?.getTime() || null,
  }));

  return c.json(formattedLists);
});

// POST /lists - Create a new list
const createListRoute = createRoute({
  method: "post",
  path: "/lists",
  tags: ["Lists"],
  summary: "Create a new import list",
  request: {
    body: {
      content: {
        "application/json": {
          schema: createListInputSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Successfully created list",
      content: {
        "application/json": {
          schema: importListSchema,
        },
      },
    },
    400: {
      description: "Invalid configuration",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(createListRoute, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();

    const list = await listImportService.createList(user.id, body);

    return c.json(
      {
        ...list,
        createdAt: list.createdAt?.getTime() || 0,
        updatedAt: list.updatedAt?.getTime() || 0,
        lastFetchedAt: list.lastFetchedAt?.getTime() || null,
      },
      201,
    );
  } catch (error) {
    logger.error("[Lists] Create error:", error);
    return c.json({ error: getErrorMessage(error) }, 400);
  }
});

// ========== Static Routes (must come before /{id} routes) ==========

// GET /lists/sources - Get available sources
const getSourcesRoute = createRoute({
  method: "get",
  path: "/lists/sources",
  tags: ["Lists"],
  summary: "Get available list sources",
  responses: {
    200: {
      description: "Available sources",
      content: {
        "application/json": {
          schema: z.array(listSourceInfoSchema),
        },
      },
    },
  },
});

app.openapi(getSourcesRoute, async (c) => {
  // Check configuration status
  const hardcoverConfigured = await listSettingsService.isHardcoverConfigured();
  const flareSolverrConfigured =
    flareSolverrHealthService.getStatus().flareSolverrConfigured;

  const sources = listSources.map((source) => ({
    ...source,
    // Override flags based on actual configuration
    ...(source.id === "hardcover" && { requiresApiKey: !hardcoverConfigured }),
    ...(source.id === "storygraph" && {
      requiresFlareSolverr: !flareSolverrConfigured,
    }),
  }));

  return c.json(sources);
});

// POST /lists/validate - Validate source config
const validateConfigRoute = createRoute({
  method: "post",
  path: "/lists/validate",
  tags: ["Lists"],
  summary: "Validate source configuration",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            source: listSourceSchema,
            config: z.record(z.string(), z.unknown()),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Validation result",
      content: {
        "application/json": {
          schema: z.object({
            valid: z.boolean(),
            error: z.string().optional(),
          }),
        },
      },
    },
  },
});

app.openapi(validateConfigRoute, async (c) => {
  const { source, config } = await c.req.json();
  const fetcher = getFetcher(source as ListSource);
  const result = await fetcher.validateConfig(config);
  return c.json(result);
});

// POST /lists/parse-url - Parse a profile URL to extract user ID
const parseUrlRoute = createRoute({
  method: "post",
  path: "/lists/parse-url",
  tags: ["Lists"],
  summary: "Parse a profile URL to extract user ID",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            source: listSourceSchema,
            url: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Parsed result",
      content: {
        "application/json": {
          schema: z.object({
            userId: z.string().nullable(),
          }),
        },
      },
    },
  },
});

app.openapi(parseUrlRoute, async (c) => {
  const { source, url } = await c.req.json();
  const fetcher = getFetcher(source as ListSource);

  if (!fetcher.parseProfileUrl) {
    return c.json({ userId: null });
  }

  const result = await fetcher.parseProfileUrl(url);
  return c.json({ userId: result?.userId || null });
});

// GET /lists/goodreads/shelves - Get Goodreads shelves
const getGoodreadsShelvesRoute = createRoute({
  method: "get",
  path: "/lists/goodreads/shelves",
  tags: ["Lists"],
  summary: "Get available Goodreads shelves for a user",
  request: {
    query: z.object({
      userId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Available shelves",
      content: {
        "application/json": {
          schema: z.array(availableListSchema),
        },
      },
    },
  },
});

app.openapi(getGoodreadsShelvesRoute, async (c) => {
  const { userId } = c.req.query();
  const fetcher = getFetcher("goodreads");

  if (!fetcher.getAvailableLists) {
    return c.json([]);
  }

  const shelves = await fetcher.getAvailableLists({ userId });
  return c.json(shelves);
});

// GET /lists/hardcover/lists - Get Hardcover lists
const getHardcoverListsRoute = createRoute({
  method: "get",
  path: "/lists/hardcover/lists",
  tags: ["Lists"],
  summary: "Get available Hardcover lists for a user",
  request: {
    query: z.object({
      username: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Available lists",
      content: {
        "application/json": {
          schema: z.array(availableListSchema),
        },
      },
    },
  },
});

app.openapi(getHardcoverListsRoute, async (c) => {
  const { username } = c.req.query();
  const fetcher = getFetcher("hardcover");

  if (!fetcher.getAvailableLists) {
    return c.json([]);
  }

  const lists = await fetcher.getAvailableLists({ username });
  return c.json(lists);
});

// GET /lists/openlibrary/lists - Get OpenLibrary lists
const getOpenLibraryListsRoute = createRoute({
  method: "get",
  path: "/lists/openlibrary/lists",
  tags: ["Lists"],
  summary: "Get available OpenLibrary lists for a user",
  request: {
    query: z.object({
      username: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Available lists",
      content: {
        "application/json": {
          schema: z.array(availableListSchema),
        },
      },
    },
  },
});

app.openapi(getOpenLibraryListsRoute, async (c) => {
  const { username } = c.req.query();
  const fetcher = getFetcher("openlibrary");

  if (!fetcher.getAvailableLists) {
    return c.json([]);
  }

  const lists = await fetcher.getAvailableLists({ username });
  return c.json(lists);
});

// ========== Parameterized Routes (must come after static routes) ==========

// GET /lists/:id - Get single list
const getListRoute = createRoute({
  method: "get",
  path: "/lists/{id}",
  tags: ["Lists"],
  summary: "Get a single import list",
  request: {
    params: z.object({
      id: z.string().transform((v) => parseInt(v, 10)),
    }),
  },
  responses: {
    200: {
      description: "Import list",
      content: {
        "application/json": {
          schema: importListSchema,
        },
      },
    },
    403: {
      description: "Not authorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "List not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(getListRoute, async (c) => {
  const user = c.get("user");
  const isAdmin = user.role === "admin";
  const { id } = c.req.param();
  const listId = parseInt(id, 10);

  const list = await listImportService.getListById(listId);

  if (!list) {
    return c.json({ error: "List not found" }, 404);
  }

  if (!isAdmin && list.userId !== user.id) {
    return c.json({ error: "Not authorized" }, 403);
  }

  return c.json(
    {
      ...list,
      createdAt: list.createdAt?.getTime() || 0,
      updatedAt: list.updatedAt?.getTime() || 0,
      lastFetchedAt: list.lastFetchedAt?.getTime() || null,
    },
    200,
  );
});

// PUT /lists/:id - Update a list
const updateListRoute = createRoute({
  method: "put",
  path: "/lists/{id}",
  tags: ["Lists"],
  summary: "Update an import list",
  request: {
    params: z.object({
      id: z.string().transform((v) => parseInt(v, 10)),
    }),
    body: {
      content: {
        "application/json": {
          schema: updateListInputSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated list",
      content: {
        "application/json": {
          schema: importListSchema,
        },
      },
    },
    400: {
      description: "Invalid configuration",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "List not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(updateListRoute, async (c) => {
  try {
    const user = c.get("user");
    const isAdmin = user.role === "admin";
    const { id } = c.req.param();
    const listId = parseInt(id, 10);
    const body = await c.req.json();

    const list = await listImportService.updateList(
      listId,
      user.id,
      isAdmin,
      body,
    );

    return c.json(
      {
        ...list,
        createdAt: list.createdAt?.getTime() || 0,
        updatedAt: list.updatedAt?.getTime() || 0,
        lastFetchedAt: list.lastFetchedAt?.getTime() || null,
      },
      200,
    );
  } catch (error) {
    logger.error("[Lists] Update error:", error);
    const message = getErrorMessage(error);
    if (message.includes("not found")) {
      return c.json({ error: message }, 404);
    }
    return c.json({ error: message }, 400);
  }
});

// DELETE /lists/:id - Delete a list
const deleteListRoute = createRoute({
  method: "delete",
  path: "/lists/{id}",
  tags: ["Lists"],
  summary: "Delete an import list",
  request: {
    params: z.object({
      id: z.string().transform((v) => parseInt(v, 10)),
    }),
  },
  responses: {
    204: {
      description: "Successfully deleted",
    },
    404: {
      description: "List not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(deleteListRoute, async (c) => {
  try {
    const user = c.get("user");
    const isAdmin = user.role === "admin";
    const { id } = c.req.param();
    const listId = parseInt(id, 10);

    await listImportService.deleteList(listId, user.id, isAdmin);

    return c.body(null, 204);
  } catch (error) {
    logger.error("[Lists] Delete error:", error);
    const message = getErrorMessage(error);
    if (message.includes("not found")) {
      return c.json({ error: message }, 404);
    }
    return c.json({ error: message }, 400);
  }
});

// POST /lists/:id/refresh - Manually trigger a fetch
const refreshListRoute = createRoute({
  method: "post",
  path: "/lists/{id}/refresh",
  tags: ["Lists"],
  summary: "Manually refresh an import list",
  request: {
    params: z.object({
      id: z.string().transform((v) => parseInt(v, 10)),
    }),
  },
  responses: {
    200: {
      description: "Refresh result",
      content: {
        "application/json": {
          schema: processResultSchema,
        },
      },
    },
    403: {
      description: "Not authorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "List not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(refreshListRoute, async (c) => {
  try {
    const user = c.get("user");
    const isAdmin = user.role === "admin";
    const { id } = c.req.param();
    const listId = parseInt(id, 10);

    // Verify ownership
    const list = await listImportService.getListById(listId);
    if (!list) {
      return c.json({ error: "List not found" }, 404);
    }
    if (!isAdmin && list.userId !== user.id) {
      return c.json({ error: "Not authorized" }, 403);
    }

    const result = await listImportService.fetchAndProcessList(listId);
    return c.json(result, 200);
  } catch (error) {
    logger.error("[Lists] Refresh error:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export default app;
