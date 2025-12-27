import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { tolinoSettingsService } from "../services/tolino-settings.js";
import { tolinoUploadService } from "../services/tolino/uploader.js";
import {
  getAllResellers,
  type ResellerId,
} from "../services/tolino/resellers.js";
import { downloadTracker } from "../services/download-tracker.js";
import { permissionsService } from "../services/permissions.js";
import type { User } from "../db/schema.js";
import { logger } from "../utils/logger.js";

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
 * POST /tolino/upload
 * Upload a book to Tolino Cloud
 */
const uploadSchema = z.object({
  md5: z.string().min(1),
});

tolino.post("/upload", zValidator("json", uploadSchema), async (c) => {
  const user = c.get("user")!;
  const { md5 } = c.req.valid("json");

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
  const result = await tolinoUploadService.uploadBook(user.id, md5);

  if (!result.success) {
    return c.json({ error: result.message }, 400);
  }

  return c.json({
    success: true,
    message: result.message,
    uploadedAt: result.uploadedAt,
  });
});

export default tolino;
