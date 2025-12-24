import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { emailSettingsService } from "../services/email-settings.js";
import { emailService } from "../services/email.js";
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

const app = new OpenAPIHono();

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

// GET /email/recipients
const getEmailRecipientsRoute = createRoute({
  method: "get",
  path: "/email/recipients",
  tags: ["Email"],
  summary: "Get all email recipients",
  description: "Get list of all configured email recipients",
  responses: {
    200: {
      description: "List of recipients",
      content: {
        "application/json": {
          schema: z.array(emailRecipientSchema),
        },
      },
    },
  },
});

app.openapi(getEmailRecipientsRoute, async (c) => {
  const recipients = await emailSettingsService.getRecipients();
  // Convert timestamps to ISO strings
  const formatted = recipients.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
  return c.json(formatted, 200);
});

// POST /email/recipients
const addEmailRecipientRoute = createRoute({
  method: "post",
  path: "/email/recipients",
  tags: ["Email"],
  summary: "Add email recipient",
  description: "Add a new email recipient",
  request: {
    body: {
      content: {
        "application/json": {
          schema: emailRecipientCreateSchema,
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
  },
});

app.openapi(addEmailRecipientRoute, async (c) => {
  try {
    const { email, name, autoSend } = c.req.valid("json");
    const recipient = await emailSettingsService.addRecipient(
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
  description: "Delete an email recipient by ID",
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    204: {
      description: "Recipient deleted",
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
  const { id } = c.req.valid("param");
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
  description: "Update an email recipient by ID",
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
    const { id } = c.req.valid("param");
    const updates = c.req.valid("json");
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

// ============== Send Email Route ==============

// POST /email/send
const sendEmailRoute = createRoute({
  method: "post",
  path: "/email/send",
  tags: ["Email"],
  summary: "Send book to recipient",
  description: "Send a downloaded book as email attachment to a recipient",
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
    const { recipientId, md5 } = c.req.valid("json");

    await emailService.sendBook(recipientId, md5);

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
