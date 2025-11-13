import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { indexerSettingsService } from "../services/indexer-settings.js";

const indexer = new OpenAPIHono();

// Get indexer settings
const getSettingsRoute = createRoute({
  method: "get",
  path: "/indexer/settings",
  summary: "Get indexer settings",
  description: "Retrieve current Newznab and SABnzbd indexer configuration",
  tags: ["Settings"],
  responses: {
    200: {
      description: "Indexer settings",
      content: {
        "application/json": {
          schema: z.object({
            baseUrl: z.string(),
            newznabEnabled: z.boolean(),
            newznabApiKey: z.string().nullable(),
            newznabUrl: z.string(),
            sabnzbdEnabled: z.boolean(),
            sabnzbdApiKey: z.string().nullable(),
            sabnzbdUrl: z.string(),
            indexerOnlyMode: z.boolean(),
            indexerCompletedDir: z.string(),
            indexerIncompleteDir: z.string(),
            indexerCategoryDir: z.boolean(),
            createdAt: z.number(),
            updatedAt: z.number(),
          }),
        },
      },
    },
  },
});

indexer.openapi(getSettingsRoute, async (c) => {
  const settings = await indexerSettingsService.getSettings();

  return c.json({
    baseUrl: settings.baseUrl,
    newznabEnabled: settings.newznabEnabled,
    newznabApiKey: settings.newznabApiKey,
    newznabUrl: `${settings.baseUrl}/newznab`,
    sabnzbdEnabled: settings.sabnzbdEnabled,
    sabnzbdApiKey: settings.sabnzbdApiKey,
    sabnzbdUrl: `${settings.baseUrl}/sabnzbd`,
    indexerOnlyMode: settings.indexerOnlyMode,
    indexerCompletedDir: settings.indexerCompletedDir,
    indexerIncompleteDir: settings.indexerIncompleteDir,
    indexerCategoryDir: settings.indexerCategoryDir,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  });
});

// Update indexer settings
const updateSettingsRoute = createRoute({
  method: "put",
  path: "/indexer/settings",
  summary: "Update indexer settings",
  description: "Update Newznab and SABnzbd indexer configuration",
  tags: ["Settings"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            baseUrl: z.string().url().optional(),
            newznabEnabled: z.boolean().optional(),
            sabnzbdEnabled: z.boolean().optional(),
            indexerOnlyMode: z.boolean().optional(),
            indexerCompletedDir: z.string().optional(),
            indexerIncompleteDir: z.string().optional(),
            indexerCategoryDir: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated indexer settings",
      content: {
        "application/json": {
          schema: z.object({
            baseUrl: z.string(),
            newznabEnabled: z.boolean(),
            newznabApiKey: z.string().nullable(),
            newznabUrl: z.string(),
            sabnzbdEnabled: z.boolean(),
            sabnzbdApiKey: z.string().nullable(),
            sabnzbdUrl: z.string(),
            indexerOnlyMode: z.boolean(),
            indexerCompletedDir: z.string(),
            indexerIncompleteDir: z.string(),
            indexerCategoryDir: z.boolean(),
            createdAt: z.number(),
            updatedAt: z.number(),
          }),
        },
      },
    },
    400: {
      description: "Invalid request",
    },
  },
});

indexer.openapi(updateSettingsRoute, async (c) => {
  const body = await c.req.json();
  const updates = await indexerSettingsService.updateSettings(body);

  return c.json({
    baseUrl: updates.baseUrl,
    newznabEnabled: updates.newznabEnabled,
    newznabApiKey: updates.newznabApiKey,
    newznabUrl: `${updates.baseUrl}/newznab`,
    sabnzbdEnabled: updates.sabnzbdEnabled,
    sabnzbdApiKey: updates.sabnzbdApiKey,
    sabnzbdUrl: `${updates.baseUrl}/sabnzbd`,
    indexerOnlyMode: updates.indexerOnlyMode,
    indexerCompletedDir: updates.indexerCompletedDir,
    indexerIncompleteDir: updates.indexerIncompleteDir,
    indexerCategoryDir: updates.indexerCategoryDir,
    createdAt: updates.createdAt,
    updatedAt: updates.updatedAt,
  });
});

// Regenerate API key
const regenerateKeyRoute = createRoute({
  method: "post",
  path: "/indexer/regenerate-key",
  summary: "Regenerate API key",
  description: "Generate a new API key for Newznab or SABnzbd",
  tags: ["Settings"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            service: z.enum(["newznab", "sabnzbd"]),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "New API key generated",
      content: {
        "application/json": {
          schema: z.object({
            apiKey: z.string(),
            service: z.string(),
          }),
        },
      },
    },
    400: {
      description: "Invalid request",
    },
  },
});

indexer.openapi(regenerateKeyRoute, async (c) => {
  const { service } = await c.req.json();
  const settings = await indexerSettingsService.regenerateApiKey(service);

  const apiKey =
    service === "newznab" ? settings.newznabApiKey : settings.sabnzbdApiKey;

  return c.json({
    apiKey: apiKey || "",
    service,
  });
});

export default indexer;
