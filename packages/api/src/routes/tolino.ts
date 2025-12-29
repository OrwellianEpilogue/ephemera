import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { tolinoSettingsService } from "../services/tolino-settings.js";
import { tolinoUploadService } from "../services/tolino/uploader.js";
import { TolinoApiClient } from "../services/tolino/api.js";
import { tolinoAuthService } from "../services/tolino/auth.js";
import {
  getAllResellers,
  type ResellerId,
} from "../services/tolino/resellers.js";
import { downloadTracker } from "../services/download-tracker.js";
import { permissionsService } from "../services/permissions.js";
import { appriseService } from "../services/apprise.js";
import type { User } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { db } from "../db/index.js";
import { downloadRequests, bookMetadata } from "../db/schema.js";
import { eq } from "drizzle-orm";

// Helper to check if user is admin
const isAdmin = (user: User): boolean => user.role === "admin";

const tolino = new Hono();

// All routes require authentication and canConfigureTolino permission
tolino.use("/*", async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const permissions = await permissionsService.getPermissions(user.id);
  if (!permissions.canConfigureTolino) {
    return c.json({ error: "Permission denied" }, 403);
  }

  await next();
});

/**
 * GET /tolino/resellers
 * Get available Tolino resellers
 */
tolino.get("/resellers", (c) => {
  const resellers = getAllResellers();
  return c.json(resellers);
});

/**
 * GET /tolino/settings
 * Get current user's Tolino settings (without password)
 */
tolino.get("/settings", async (c) => {
  const user = c.get("user")!;

  const settings = await tolinoSettingsService.getSettings(user.id);
  if (!settings) {
    return c.json({ configured: false });
  }

  return c.json({
    configured: true,
    ...settings,
  });
});

/**
 * PUT /tolino/settings
 * Save or update Tolino settings
 */
const settingsSchema = z.object({
  resellerId: z.enum(["buchhandlung", "hugendubel"]),
  email: z.string().email(),
  password: z.string().min(1),
  autoUpload: z.boolean(),
  askCollectionOnUpload: z.boolean().optional(),
  autoUploadCollection: z.string().nullable().optional(),
  useSeriesAsCollection: z.boolean().optional(),
});

tolino.put("/settings", zValidator("json", settingsSchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");

  try {
    const settings = await tolinoSettingsService.saveSettings(user.id, {
      resellerId: body.resellerId as ResellerId,
      email: body.email,
      password: body.password,
      autoUpload: body.autoUpload,
      askCollectionOnUpload: body.askCollectionOnUpload,
      autoUploadCollection: body.autoUploadCollection,
      useSeriesAsCollection: body.useSeriesAsCollection,
    });

    return c.json({
      success: true,
      settings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save settings";
    logger.error(`[Tolino Routes] Save settings failed:`, error);
    return c.json({ error: message }, 400);
  }
});

/**
 * PATCH /tolino/settings/auto-upload
 * Update only the auto-upload setting
 */
const autoUploadSchema = z.object({
  autoUpload: z.boolean(),
});

tolino.patch(
  "/settings/auto-upload",
  zValidator("json", autoUploadSchema),
  async (c) => {
    const user = c.get("user")!;
    const { autoUpload } = c.req.valid("json");

    const hasSettings = await tolinoSettingsService.hasSettings(user.id);
    if (!hasSettings) {
      return c.json({ error: "Tolino not configured" }, 400);
    }

    await tolinoSettingsService.updateAutoUpload(user.id, autoUpload);

    return c.json({ success: true, autoUpload });
  },
);

/**
 * DELETE /tolino/settings
 * Delete Tolino settings for current user
 */
tolino.delete("/settings", async (c) => {
  const user = c.get("user")!;

  const deleted = await tolinoSettingsService.deleteSettings(user.id);

  return c.json({ success: deleted });
});

/**
 * PATCH /tolino/settings/collections
 * Update collection settings only
 */
const collectionSettingsSchema = z.object({
  askCollectionOnUpload: z.boolean(),
  autoUploadCollection: z.string().nullable(),
  useSeriesAsCollection: z.boolean().optional(),
});

tolino.patch(
  "/settings/collections",
  zValidator("json", collectionSettingsSchema),
  async (c) => {
    const user = c.get("user")!;
    const {
      askCollectionOnUpload,
      autoUploadCollection,
      useSeriesAsCollection,
    } = c.req.valid("json");

    const hasSettings = await tolinoSettingsService.hasSettings(user.id);
    if (!hasSettings) {
      return c.json({ error: "Tolino not configured" }, 400);
    }

    await tolinoSettingsService.updateCollectionSettings(
      user.id,
      askCollectionOnUpload,
      autoUploadCollection,
      useSeriesAsCollection,
    );

    return c.json({
      success: true,
      askCollectionOnUpload,
      autoUploadCollection,
      useSeriesAsCollection,
    });
  },
);

/**
 * GET /tolino/collections
 * Get available collections from Tolino Cloud
 */
tolino.get("/collections", async (c) => {
  const user = c.get("user")!;

  // Get user's settings to check if configured and get tokens
  const settings = await tolinoSettingsService.getRawSettings(user.id);
  if (!settings) {
    return c.json({ error: "Tolino not configured" }, 400);
  }

  if (
    !settings.accessToken ||
    !settings.refreshToken ||
    !settings.tokenExpiresAt
  ) {
    return c.json({ error: "Not authenticated with Tolino Cloud" }, 401);
  }

  try {
    let accessToken = settings.accessToken;

    // Check if token needs refresh
    if (tolinoAuthService.shouldRefreshToken(settings.tokenExpiresAt)) {
      logger.info(`[Tolino Routes] Refreshing expired token for collections`);
      try {
        const newTokens = await tolinoAuthService.refreshToken(
          settings.refreshToken,
          settings.resellerId as ResellerId,
        );
        await tolinoSettingsService.updateTokens(user.id, newTokens);
        accessToken = newTokens.accessToken;
      } catch (refreshError) {
        logger.error(`[Tolino Routes] Token refresh failed:`, refreshError);
        return c.json(
          {
            error: "Session expired. Please re-enter your Tolino credentials.",
          },
          401,
        );
      }
    }

    const client = new TolinoApiClient(
      accessToken,
      settings.hardwareId || "",
      settings.resellerId as ResellerId,
    );

    const result = await client.getReadingMetadata();

    if (!result.success) {
      return c.json(
        { error: result.error || "Failed to fetch collections" },
        400,
      );
    }

    return c.json({ collections: result.collections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[Tolino Routes] Failed to fetch collections:`, error);
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /tolino/test
 * Test Tolino connection with current settings
 */
tolino.post("/test", async (c) => {
  const user = c.get("user")!;

  const result = await tolinoUploadService.testConnection(user.id);

  if (!result.success) {
    return c.json({ success: false, error: result.message }, 400);
  }

  return c.json({ success: true, message: result.message });
});

/**
 * GET /tolino/can-upload/:md5
 * Check if a specific book can be uploaded to Tolino
 */
tolino.get("/can-upload/:md5", async (c) => {
  const user = c.get("user")!;
  const md5 = c.req.param("md5");

  // Check if user has Tolino configured
  const hasSettings = await tolinoSettingsService.hasSettings(user.id);
  if (!hasSettings) {
    return c.json({
      canUpload: false,
      needsConversion: false,
      reason: "Tolino not configured",
    });
  }

  // Check if book exists and user has access
  const download = await downloadTracker.get(md5);
  if (!download) {
    return c.json({
      canUpload: false,
      needsConversion: false,
      reason: "Book not found",
    });
  }

  // Check ownership (unless admin or legacy download with no userId)
  if (download.userId && download.userId !== user.id && !isAdmin(user)) {
    return c.json({
      canUpload: false,
      needsConversion: false,
      reason: "Access denied",
    });
  }

  // Check format compatibility
  const result = await tolinoUploadService.canUpload(md5);

  return c.json(result);
});

/**
 * GET /tolino/suggested-collection/:md5
 * Get suggested collection (series name) for a book
 * Always returns series name if available - the setting only controls auto-upload behavior
 */
tolino.get("/suggested-collection/:md5", async (c) => {
  const md5 = c.req.param("md5");

  try {
    // Find request that was fulfilled with this book
    const [request] = await db
      .select()
      .from(downloadRequests)
      .where(eq(downloadRequests.fulfilledBookMd5, md5))
      .limit(1);

    if (!request) {
      return c.json({ suggestedCollection: null });
    }

    // Get metadata for this request
    const [metadata] = await db
      .select()
      .from(bookMetadata)
      .where(eq(bookMetadata.requestId, request.id))
      .limit(1);

    return c.json({
      suggestedCollection: metadata?.seriesName || null,
    });
  } catch (error) {
    logger.warn(`[Tolino Routes] Error getting suggested collection:`, error);
    return c.json({ suggestedCollection: null });
  }
});

/**
 * POST /tolino/upload
 * Upload a book to Tolino Cloud
 */
const uploadSchema = z.object({
  md5: z.string().min(1),
  collection: z.string().optional(),
});

tolino.post("/upload", zValidator("json", uploadSchema), async (c) => {
  const user = c.get("user")!;
  const { md5, collection } = c.req.valid("json");

  // Check if book exists and user has access
  const download = await downloadTracker.get(md5);
  if (!download) {
    return c.json({ error: "Book not found" }, 404);
  }

  // Check ownership (unless admin or legacy download with no userId)
  if (download.userId && download.userId !== user.id && !isAdmin(user)) {
    return c.json({ error: "Access denied" }, 403);
  }

  // Check if user has Tolino configured
  const hasSettings = await tolinoSettingsService.hasSettings(user.id);
  if (!hasSettings) {
    return c.json({ error: "Tolino not configured" }, 400);
  }

  // Perform upload
  const result = await tolinoUploadService.uploadBook(user.id, md5, {
    collectionName: collection,
  });

  if (!result.success) {
    return c.json({ error: result.message }, 400);
  }

  // Send notification for manual Tolino upload
  await appriseService.send("tolino_uploaded", {
    bookTitle: download.title || "Unknown",
    bookAuthors: download.author,
    collectionName: collection,
  });

  return c.json({
    success: true,
    message: result.message,
    uploadedAt: result.uploadedAt,
    collectionAdded: result.collectionAdded,
    collectionError: result.collectionError,
  });
});

export default tolino;
