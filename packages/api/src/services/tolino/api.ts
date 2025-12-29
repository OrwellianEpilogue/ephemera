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

export interface ReadingMetadataResult {
  success: boolean;
  revision: string;
  collections: string[];
  error?: string;
}

export interface AddToCollectionResult {
  success: boolean;
  revision?: string;
  error?: string;
}

// Reading metadata API response types
interface ReadingMetadataPatch {
  op: string;
  path: string;
  value?: {
    category?: string;
    name?: string;
    modified?: number;
    revision?: string;
    [key: string]: unknown;
  };
}

interface ReadingMetadataResponse {
  revision: string;
  patches?: ReadingMetadataPatch[];
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
   * Get current reading metadata revision and list of collections
   * Sends an empty revision to get the current state
   */
  async getReadingMetadata(): Promise<ReadingMetadataResult> {
    try {
      logger.info(`[Tolino API] Fetching reading metadata and collections`);

      const resellerId = getResellerApiId(this.resellerId);

      logger.debug(
        `[Tolino API] Fetching with device-id: ${this.hardwareId}, reseller-id: ${resellerId}`,
      );

      const response = await fetch(
        "https://api.pageplace.de/v4/reading-metadata?paths=publications,audiobooks",
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            authorization: `Bearer ${this.accessToken}`,
            client_type: "TOLINO_WEBREADER",
            "client-type": "TOLINO_WEBREADER",
            "reseller-id": resellerId,
            "device-id": this.hardwareId,
            Referer: "https://webreader.mytolino.com/",
            Origin: "https://webreader.mytolino.com",
          },
          body: JSON.stringify({
            revision: "",
            patches: [],
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        logger.error(
          `[Tolino API] Failed to get reading metadata: ${response.status} - ${text}`,
        );
        return {
          success: false,
          revision: "",
          collections: [],
          error: `Failed to get reading metadata: ${response.status}`,
        };
      }

      const data = (await response.json()) as ReadingMetadataResponse;

      // Extract unique collection names from patches
      const collections = new Set<string>();
      if (data.patches) {
        for (const patch of data.patches) {
          if (patch.value?.category === "collection" && patch.value?.name) {
            collections.add(patch.value.name);
          }
        }
      }

      logger.info(
        `[Tolino API] Got ${collections.size} collections, revision: ${data.revision.substring(0, 20)}...`,
      );

      return {
        success: true,
        revision: data.revision,
        collections: Array.from(collections).sort(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Tolino API] Error getting reading metadata: ${message}`);
      return {
        success: false,
        revision: "",
        collections: [],
        error: message,
      };
    }
  }

  /**
   * Add a book to a collection
   * @param revision Current revision token from getReadingMetadata()
   * @param bookUuid The book's UUID (inventoryUuid from upload)
   * @param collectionName Name of the collection (created if doesn't exist)
   */
  async addToCollection(
    revision: string,
    bookUuid: string,
    collectionName: string,
  ): Promise<AddToCollectionResult> {
    try {
      logger.info(
        `[Tolino API] Adding book ${bookUuid} to collection "${collectionName}"`,
      );

      const resellerId = getResellerApiId(this.resellerId);

      const response = await fetch(
        "https://api.pageplace.de/v4/reading-metadata?paths=publications,audiobooks",
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            authorization: `Bearer ${this.accessToken}`,
            client_type: "TOLINO_WEBREADER",
            "client-type": "TOLINO_WEBREADER",
            "reseller-id": resellerId,
            "device-id": this.hardwareId,
            Referer: "https://webreader.mytolino.com/",
            Origin: "https://webreader.mytolino.com",
          },
          body: JSON.stringify({
            revision,
            patches: [
              {
                op: "add",
                path: `publications/${bookUuid}/tags`,
                value: {
                  name: collectionName,
                  category: "collection",
                  modified: Date.now(),
                },
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        logger.error(
          `[Tolino API] Failed to add to collection: ${response.status} - ${text}`,
        );
        return {
          success: false,
          error: `Failed to add to collection: ${response.status}`,
        };
      }

      const data = (await response.json()) as ReadingMetadataResponse;

      logger.info(
        `[Tolino API] Book added to collection "${collectionName}" successfully`,
      );

      return {
        success: true,
        revision: data.revision,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Tolino API] Error adding to collection: ${message}`);
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
