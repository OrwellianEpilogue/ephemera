import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { existsSync } from "fs";
import { extname } from "path";
import type { EmailTestRequest } from "@ephemera/shared";
import { emailSettingsService } from "./email-settings.js";
import { downloadTracker } from "./download-tracker.js";
import { bookService } from "./book-service.js";
import { logger } from "../utils/logger.js";

/**
 * Email Service
 * Handles sending books via SMTP email
 */
class EmailService {
  /**
   * Create nodemailer transporter from current settings
   */
  async getTransporter(): Promise<Transporter> {
    const settings = await emailSettingsService.getSettings();

    if (!settings?.enabled || !settings.smtpHost) {
      throw new Error("Email is not configured");
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.useTls && settings.smtpPort === 465, // true for 465, false for other ports
      auth: settings.smtpUser
        ? {
            user: settings.smtpUser,
            pass: settings.smtpPassword || "",
          }
        : undefined,
      tls: settings.useTls
        ? {
            rejectUnauthorized: false, // Allow self-signed certificates
          }
        : undefined,
    });

    return transporter;
  }

  /**
   * Test SMTP connection with provided settings or saved settings
   */
  async testConnection(testSettings?: EmailTestRequest): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      // If test settings provided, use them directly
      if (testSettings) {
        if (!testSettings.smtpHost) {
          return {
            success: false,
            message: "SMTP host not configured",
            error: "Please enter SMTP host",
          };
        }

        const transporter = nodemailer.createTransport({
          host: testSettings.smtpHost,
          port: testSettings.smtpPort || 587,
          secure: testSettings.useTls && testSettings.smtpPort === 465,
          auth: testSettings.smtpUser
            ? {
                user: testSettings.smtpUser,
                pass: testSettings.smtpPassword || "",
              }
            : undefined,
          tls: testSettings.useTls
            ? {
                rejectUnauthorized: false,
              }
            : undefined,
        });

        await transporter.verify();
        return { success: true, message: "SMTP connection successful" };
      }

      // Fall back to saved settings
      const settings = await emailSettingsService.getSettings();
      if (!settings?.enabled) {
        return {
          success: false,
          message: "Email is not enabled",
          error: "Please enable email and save settings first",
        };
      }
      if (!settings.smtpHost) {
        return {
          success: false,
          message: "SMTP host not configured",
          error: "Please enter SMTP host and save settings first",
        };
      }

      const transport = await this.getTransporter();
      await transport.verify();
      return { success: true, message: "SMTP connection successful" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[Email] Connection test failed:", error);
      return {
        success: false,
        message: "SMTP connection failed",
        error: errorMessage,
      };
    }
  }

  /**
   * Send a book to a recipient as email attachment
   */
  async sendBook(recipientId: number, md5: string): Promise<void> {
    const settings = await emailSettingsService.getSettings();
    const recipient = await emailSettingsService.getRecipient(recipientId);

    if (!recipient) {
      throw new Error("Recipient not found");
    }

    if (!settings?.senderEmail) {
      throw new Error("Sender email not configured");
    }

    // Get download record
    const download = await downloadTracker.get(md5);
    if (!download) {
      throw new Error("Book not found in downloads");
    }

    // Check status
    if (download.status !== "available" && download.status !== "done") {
      throw new Error(`Cannot send book with status: ${download.status}`);
    }

    // Determine file path
    const filePath =
      download.status === "available" ? download.finalPath : download.tempPath;
    if (!filePath || !existsSync(filePath)) {
      throw new Error("Book file not found on server");
    }

    // Get book metadata from books table if available
    const book = await bookService.getBook(md5);
    const title = download.title || book?.title || "Untitled";
    const author = download.author || (book?.authors ? book.authors[0] : null);

    // Get file format
    const format = (
      download.format ||
      extname(filePath).slice(1) ||
      "pdf"
    ).toLowerCase();

    // Generate filename for attachment
    const parts = [title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim()];
    if (author) {
      parts.push(author.replace(/[^a-zA-Z0-9-_ ]/g, "").trim());
    }
    if (download.year) {
      parts.push(download.year.toString());
    }
    const filename = `${parts.join(" - ")}.${format}`;

    const transport = await this.getTransporter();

    const mailOptions = {
      from: settings.senderName
        ? `"${settings.senderName}" <${settings.senderEmail}>`
        : settings.senderEmail,
      to: recipient.name
        ? `"${recipient.name}" <${recipient.email}>`
        : recipient.email,
      subject: `Book: ${title}`,
      text: `Here is your requested book: ${title}${author ? ` by ${author}` : ""}`,
      html: `
        <h2>Your Book</h2>
        <p><strong>Title:</strong> ${escapeHtml(title)}</p>
        ${author ? `<p><strong>Author:</strong> ${escapeHtml(author)}</p>` : ""}
        ${download.year ? `<p><strong>Year:</strong> ${download.year}</p>` : ""}
        <p>The book is attached to this email.</p>
      `,
      attachments: [
        {
          filename,
          path: filePath,
        },
      ],
    };

    logger.info(`[Email] Sending "${title}" to ${recipient.email}`);
    await transport.sendMail(mailOptions);
    logger.info(`[Email] Successfully sent "${title}" to ${recipient.email}`);
  }
}

/**
 * Simple HTML escaper for email content
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Export singleton instance
export const emailService = new EmailService();
