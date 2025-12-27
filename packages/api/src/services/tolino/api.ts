import { readFile } from "fs/promises";
import { basename, extname } from "path";
import { randomBytes } from "crypto";
import { getResellerApiId, type ResellerId } from "./resellers.js";
import { logger } from "../../utils/logger.js";

export interface UploadResult {
  success: boolean;
  inventoryUuid?: string;
  error?: string;
}

export interface CoverUploadResult {
  success: boolean;
  error?: string;
}

// MIME types for supported formats
const MIME_TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/**
 * Tolino Cloud API Client
 * Handles book and cover uploads to the Tolino Cloud
 */
export class TolinoApiClient {
  constructor(
    private accessToken: string,
    private hardwareId: string,
    private resellerId: ResellerId,
  ) {}

  /**
   * Upload an EPUB or PDF book to Tolino Cloud
   */
  async uploadBook(filePath: string, filename: string): Promise<UploadResult> {
    const format = extname(filename).toLowerCase().slice(1);
    const mimeType = MIME_TYPES[format];

    if (!mimeType || (format !== "epub" && format !== "pdf")) {
      return {
        success: false,
        error: `Unsupported format: ${format}. Only EPUB and PDF are supported.`,
      };
    }

    try {
      logger.info(`[Tolino API] Uploading book: ${filename}`);

      const fileData = await readFile(filePath);
      const resellerId = getResellerApiId(this.resellerId);
      const boundary = `----WebKitFormBoundary${randomBytes(16).toString("hex")}`;

      // Build multipart form data
      const body = this.createMultipartBody(
        fileData,
        filename,
        mimeType,
        boundary,
      );

      const response = await fetch(
        "https://bosh.pageplace.de/bosh/rest/v1/inventory/user-uploads",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.7,de;q=0.3",
            "Accept-Encoding": "gzip, deflate, br",
            Referer: "https://webreader.mytolino.com/",
            Origin: "https://webreader.mytolino.com",
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            reseller_id: resellerId,
            t_auth_token: this.accessToken,
            hardware_id: this.hardwareId,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site",
          },
          body: new Uint8Array(body),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        logger.error(
          `[Tolino API] Upload failed: ${response.status} - ${text}`,
        );
        return {
          success: false,
          error: `Upload failed: ${response.status}`,
        };
      }

      const data = (await response.json()) as {
        metadata?: { inventoryUuid?: string };
        inventoryUuid?: string;
        success?: boolean;
        error?: string;
      };

      // inventoryUuid might be in metadata or at root level
      const inventoryUuid = data.metadata?.inventoryUuid || data.inventoryUuid;

      if (!inventoryUuid) {
        logger.warn(
          `[Tolino API] Upload succeeded but no inventoryUuid returned`,
        );
        return {
          success: true,
        };
      }

      logger.info(`[Tolino API] Book uploaded successfully: ${inventoryUuid}`);

      return {
        success: true,
        inventoryUuid,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Tolino API] Upload error: ${message}`);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Upload a cover image for a book
   */
  async uploadCover(
    inventoryUuid: string,
    coverPath: string,
  ): Promise<CoverUploadResult> {
    try {
      const filename = basename(coverPath);
      const format = extname(filename).toLowerCase().slice(1);
      const mimeType = MIME_TYPES[format] || "image/jpeg";

      logger.info(`[Tolino API] Uploading cover for: ${inventoryUuid}`);

      const fileData = await readFile(coverPath);
      const resellerId = getResellerApiId(this.resellerId);
      const boundary = `----WebKitFormBoundary${randomBytes(16).toString("hex")}`;

      // Build multipart form data with deliverableId
      const body = this.createCoverMultipartBody(
        fileData,
        filename,
        mimeType,
        boundary,
        inventoryUuid,
      );

      const response = await fetch(
        `https://bosh.pageplace.de/bosh/rest/v1/inventory/user-uploads/${inventoryUuid}/cover`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.7,de;q=0.3",
            "Accept-Encoding": "gzip, deflate, br",
            Referer: "https://webreader.mytolino.com/",
            Origin: "https://webreader.mytolino.com",
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            reseller_id: resellerId,
            t_auth_token: this.accessToken,
            hardware_id: this.hardwareId,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site",
          },
          body: new Uint8Array(body),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        logger.warn(
          `[Tolino API] Cover upload failed: ${response.status} - ${text}`,
        );
        return {
          success: false,
          error: `Cover upload failed: ${response.status}`,
        };
      }

      logger.info(`[Tolino API] Cover uploaded successfully`);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`[Tolino API] Cover upload error: ${message}`);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Create multipart form data for book upload
   */
  private createMultipartBody(
    fileData: Buffer,
    filename: string,
    mimeType: string,
    boundary: string,
  ): Buffer {
    const crlf = "\r\n";
    const delimiter = `--${boundary}`;
    const closeDelimiter = `${delimiter}--`;

    // File part
    const filePart = [
      delimiter,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${mimeType}`,
      "",
      "",
    ].join(crlf);

    // Combine parts
    const preFile = Buffer.from(filePart, "utf-8");
    const postFile = Buffer.from(`${crlf}${closeDelimiter}${crlf}`, "utf-8");

    return Buffer.concat([preFile, fileData, postFile]);
  }

  /**
   * Create multipart form data for cover upload
   */
  private createCoverMultipartBody(
    fileData: Buffer,
    filename: string,
    mimeType: string,
    boundary: string,
    deliverableId: string,
  ): Buffer {
    const crlf = "\r\n";
    const delimiter = `--${boundary}`;
    const closeDelimiter = `${delimiter}--`;

    // File part
    const filePart = [
      delimiter,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${mimeType}`,
      "",
      "",
    ].join(crlf);

    // DeliverableId part
    const deliverableIdPart = [
      delimiter,
      `Content-Disposition: form-data; name="deliverableId"`,
      "",
      deliverableId,
    ].join(crlf);

    // Combine parts
    const preFile = Buffer.from(filePart, "utf-8");
    const postFile = Buffer.from(
      `${crlf}${deliverableIdPart}${crlf}${closeDelimiter}${crlf}`,
      "utf-8",
    );

    return Buffer.concat([preFile, fileData, postFile]);
  }
}
