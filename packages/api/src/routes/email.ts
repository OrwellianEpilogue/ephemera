import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { emailSettingsService } from "../services/email-settings.js";
import { emailService } from "../services/email.js";
import { downloadTracker } from "../services/download-tracker.js";
import { appriseService } from "../services/apprise.js";
import {
  emailSettingsSchema,
  updateEmailSettingsSchema,
  emailRecipientSchema,
  emailRecipientCreateSchema,
  emailRecipientUpdateSchema,
  sendEmailRequestSchema,
  sendEmailResponseSchema,
  emailTestRequestSchema,
  emailTestResponseSchema,
  errorResponseSchema,
  getErrorMessage,
} from "@ephemera/shared";
import { logger } from "../utils/logger.js";
import type { User } from "../db/schema.js";

const app = new OpenAPIHono();

// Helper to check if user is admin
const isAdmin = (user: User): boolean => user.role === "admin";

// ============== Settings Routes ==============

// GET /email/settings
const getEmailSettingsRoute = createRoute({
  method: "get",
  path: "/email/settings",
  tags: ["Email"],
  summary: "Get email settings",
  description: "Get current SMTP email configuration",
  responses: {
    200: {
      description: "Email settings",
      content: {
        "application/json": {
          schema: emailSettingsSchema.nullable(),
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

app.openapi(getEmailSettingsRoute, async (c) => {
  try {
    const settings = await emailSettingsService.getSettingsForResponse();
    return c.json(settings, 200);
  } catch (error: unknown) {
    logger.error("[Email API] Get settings error:", error);
    return c.json(
      {
        error: "Failed to get email settings",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// PUT /email/settings
const updateEmailSettingsRoute = createRoute({
  method: "put",
  path: "/email/settings",
  tags: ["Email"],
  summary: "Update email settings",
  description: "Update SMTP email configuration",
  request: {
    body: {
      content: {
        "application/json": {
          schema: updateEmailSettingsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Settings updated successfully",
      content: {
        "application/json": {
          schema: emailSettingsSchema,
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

app.openapi(updateEmailSettingsRoute, async (c) => {
  try {
    const updates = c.req.valid("json");

    logger.info("[Email API] Updating settings");

    await emailSettingsService.updateSettings(updates);
    const response = await emailSettingsService.getSettingsForResponse();

    if (!response) {
      throw new Error("Failed to get updated settings");
    }

    logger.success("[Email API] Settings updated successfully");

    return c.json(response, 200);
  } catch (error: unknown) {
    logger.error("[Email API] Update settings error:", error);
    return c.json(
      {
        error: "Failed to update email settings",
        details: getErrorMessage(error),
      },
      500,
    );
  }
});

// POST /email/settings/test
const testEmailConnectionRoute = createRoute({
  method: "post",
  path: "/email/settings/test",
  tags: ["Email"],
  summary: "Test SMTP connection",
  description:
    "Test SMTP server connection with provided settings or saved settings",
  request: {
    body: {
      content: {
        "application/json": {
          schema: emailTestRequestSchema.optional(),
        },
      },
      required: false,
    },
  },
  responses: {
    200: {
      description: "Test result",
      content: {
        "application/json": {
          schema: emailTestResponseSchema,
        },
      },
    },
    400: {
      description: "Email not configured",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(testEmailConnectionRoute, async (c) => {
  try {
    logger.info("[Email API] Testing SMTP connection");

    // Get settings from request body if provided
    const testSettings = c.req.valid("json");
    const result = await emailService.testConnection(testSettings);

    if (result.success) {
      logger.success("[Email API] SMTP connection test successful");
    } else {
      logger.warn("[Email API] SMTP connection test failed:", result.error);
    }

    return c.json(result, 200);
  } catch (error: unknown) {
    logger.error("[Email API] Connection test error:", error);
    return c.json(
      {
        error: "Email not configured",
        details: getErrorMessage(error),
      },
      400,
    );
  }
});

// ============== Recipients Routes ==============

// Extended schema for admin response with user info
const emailRecipientWithUserSchema = emailRecipientSchema.extend({
  userName: z.string().nullable().optional(),
  userEmail: z.string().nullable().optional(),
});

// GET /email/recipients
const getEmailRecipientsRoute = createRoute({
  method: "get",
  path: "/email/recipients",
  tags: ["Email"],
  summary: "Get email recipients",
  description:
    "Get list of email recipients. Admins see all, users see only their own.",
  responses: {
    200: {
      description: "List of recipients",
      content: {
        "application/json": {
          schema: z.array(emailRecipientWithUserSchema),
        },
      },
    },
  },
});

app.openapi(getEmailRecipientsRoute, async (c) => {
  const user = c.get("user") as User;

  if (isAdmin(user)) {
    // Admins see all recipients with user info
    const recipients = await emailSettingsService.getAllRecipients();
    const formatted = recipients.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
    return c.json(formatted, 200);
  } else {
    // Regular users only see their own
    const recipients = await emailSettingsService.getRecipients(user.id);
    const formatted = recipients.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
    return c.json(formatted, 200);
  }
});

// POST /email/recipients
// Extended create schema to allow admin to specify userId
const emailRecipientCreateWithUserSchema = emailRecipientCreateSchema.extend({
  userId: z.string().optional(), // Admin can specify userId to add for another user
});

const addEmailRecipientRoute = createRoute({
  method: "post",
  path: "/email/recipients",
  tags: ["Email"],
  summary: "Add email recipient",
  description:
    "Add a new email recipient. Admins can specify userId to add for another user.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: emailRecipientCreateWithUserSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Recipient created",
      content: {
        "application/json": {
          schema: emailRecipientSchema,
        },
      },
    },
    400: {
      description: "Invalid data",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - cannot add for other users",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(addEmailRecipientRoute, async (c) => {
  try {
    const user = c.get("user") as User;
    const { email, name, autoSend, userId: targetUserId } = c.req.valid("json");

    // Determine which user to add the recipient for
    let effectiveUserId = user.id;

    if (targetUserId && targetUserId !== user.id) {
      // Trying to add for another user - must be admin
      if (!isAdmin(user)) {
        return c.json(
          { error: "Only admins can add recipients for other users" },
          403,
        );
      }
      effectiveUserId = targetUserId;
    }

    const recipient = await emailSettingsService.addRecipient(
      effectiveUserId,
      email,
      name,
      autoSend,
    );

    return c.json(
      {
        ...recipient,
        createdAt: new Date(recipient.createdAt).toISOString(),
      },
      201,
    );
  } catch (error: unknown) {
    logger.error("[Email API] Add recipient error:", error);
    return c.json(
      {
        error: "Failed to add recipient",
        details: getErrorMessage(error),
      },
      400,
    );
  }
});

// DELETE /email/recipients/:id
const deleteEmailRecipientRoute = createRoute({
  method: "delete",
  path: "/email/recipients/{id}",
  tags: ["Email"],
  summary: "Delete email recipient",
  description:
    "Delete an email recipient. Users can only delete their own, admins can delete any.",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    204: {
      description: "Recipient deleted",
    },
    403: {
      description: "Forbidden - cannot delete others' recipients",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Recipient not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(deleteEmailRecipientRoute, async (c) => {
  const user = c.get("user") as User;
  const { id } = c.req.valid("param");

  // Check ownership unless admin
  if (!isAdmin(user)) {
    const isOwner = await emailSettingsService.isRecipientOwner(id, user.id);
    if (!isOwner) {
      return c.json({ error: "You can only delete your own recipients" }, 403);
    }
  }

  const deleted = await emailSettingsService.deleteRecipient(id);

  if (!deleted) {
    return c.json({ error: "Recipient not found" }, 404);
  }

  return c.body(null, 204);
});

// PATCH /email/recipients/:id
const updateEmailRecipientRoute = createRoute({
  method: "patch",
  path: "/email/recipients/{id}",
  tags: ["Email"],
  summary: "Update email recipient",
  description:
    "Update an email recipient. Users can only update their own, admins can update any.",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: {
      content: {
        "application/json": {
          schema: emailRecipientUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Recipient updated",
      content: {
        "application/json": {
          schema: emailRecipientSchema,
        },
      },
    },
    400: {
      description: "Invalid data",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - cannot update others' recipients",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Recipient not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(updateEmailRecipientRoute, async (c) => {
  try {
    const user = c.get("user") as User;
    const { id } = c.req.valid("param");
    const updates = c.req.valid("json");

    // Check ownership unless admin
    if (!isAdmin(user)) {
      const isOwner = await emailSettingsService.isRecipientOwner(id, user.id);
      if (!isOwner) {
        return c.json(
          { error: "You can only update your own recipients" },
          403,
        );
      }
    }

    const recipient = await emailSettingsService.updateRecipient(id, updates);

    if (!recipient) {
      return c.json({ error: "Recipient not found" }, 404);
    }

    return c.json(
      {
        ...recipient,
        createdAt: new Date(recipient.createdAt).toISOString(),
      },
      200,
    );
  } catch (error: unknown) {
    logger.error("[Email API] Update recipient error:", error);
    return c.json(
      {
        error: "Failed to update recipient",
        details: getErrorMessage(error),
      },
      400,
    );
  }
});

// ============== Admin Routes ==============

// POST /email/recipients/:id/reassign
const reassignEmailRecipientRoute = createRoute({
  method: "post",
  path: "/email/recipients/{id}/reassign",
  tags: ["Email"],
  summary: "Reassign email recipient",
  description: "Reassign an email recipient to another user (admin only)",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            userId: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Recipient reassigned",
      content: {
        "application/json": {
          schema: emailRecipientSchema,
        },
      },
    },
    403: {
      description: "Forbidden - admin only",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Recipient not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(reassignEmailRecipientRoute, async (c) => {
  const user = c.get("user") as User;

  if (!isAdmin(user)) {
    return c.json({ error: "Only admins can reassign recipients" }, 403);
  }

  const { id } = c.req.valid("param");
  const { userId: newUserId } = c.req.valid("json");

  const recipient = await emailSettingsService.reassignRecipient(id, newUserId);

  if (!recipient) {
    return c.json({ error: "Recipient not found" }, 404);
  }

  return c.json(
    {
      ...recipient,
      createdAt: new Date(recipient.createdAt).toISOString(),
    },
    200,
  );
});

// ============== Send Email Route ==============

// POST /email/send
const sendEmailRoute = createRoute({
  method: "post",
  path: "/email/send",
  tags: ["Email"],
  summary: "Send book to recipient",
  description:
    "Send a downloaded book as email attachment to a recipient. Users can only send to their own recipients.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: sendEmailRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Email sent successfully",
      content: {
        "application/json": {
          schema: sendEmailResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - can only send to own recipients",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Send failed",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

app.openapi(sendEmailRoute, async (c) => {
  try {
    const user = c.get("user") as User;
    const { recipientId, md5 } = c.req.valid("json");

    // Verify user owns the recipient (users can only send to their own recipients)
    if (!isAdmin(user)) {
      const isOwner = await emailSettingsService.isRecipientOwner(
        recipientId,
        user.id,
      );
      if (!isOwner) {
        return c.json(
          { error: "You can only send to your own email recipients" },
          403,
        );
      }
    }

    await emailService.sendBook(recipientId, md5);

    // Send notification for manual email send
    const [recipient, download] = await Promise.all([
      emailSettingsService.getRecipient(recipientId),
      downloadTracker.get(md5),
    ]);

    await appriseService.send("email_sent", {
      bookTitle: download?.title || "Unknown",
      bookAuthors: download?.author,
      recipientEmail: recipient?.email || "Unknown",
      recipientName: recipient?.name,
    });

    return c.json(
      {
        success: true,
        message: "Email sent successfully",
      },
      200,
    );
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error("[Email API] Send failed:", error);

    if (
      errorMessage.includes("not found") ||
      errorMessage.includes("not configured") ||
      errorMessage.includes("Cannot send")
    ) {
      return c.json(
        {
          error: "Send failed",
          details: errorMessage,
        },
        400,
      );
    }

    return c.json(
      {
        error: "Failed to send email",
        details: errorMessage,
      },
      500,
    );
  }
});

export default app;
