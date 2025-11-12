import { createReadStream, statSync } from "fs";
import { basename } from "path";
import { bookloreSettingsService } from "./booklore-settings.js";
import { refreshAccessToken, isTokenExpired } from "./booklore-auth.js";

/**
 * Booklore Upload Service
 * Handles file uploads to Booklore API
 * Gracefully fails if not configured
 */
class BookloreUploader {
  /**
   * Check if upload is possible (Booklore enabled and configured)
   */
  async canUpload(): Promise<boolean> {
    return await bookloreSettingsService.isEnabled();
  }

  /**
   * Ensure we have a fresh access token
   * Refreshes token if it expires within 5 minutes
   * @returns Fresh access token or null if refresh failed
   */
  private async ensureFreshToken(): Promise<string | null> {
    try {
      const settings = await bookloreSettingsService.getSettings();
      if (
        !settings ||
        !settings.baseUrl ||
        !settings.refreshToken ||
        !settings.accessToken
      ) {
        return null;
      }

      // Check if token needs refresh (expires in < 5 minutes)
      if (
        settings.accessTokenExpiresAt &&
        isTokenExpired(settings.accessTokenExpiresAt, 5)
      ) {
        console.log(
          "[Booklore Uploader] Access token expiring soon, refreshing...",
        );

        const refreshResult = await refreshAccessToken(
          settings.baseUrl,
          settings.refreshToken,
        );

        if (!refreshResult.success || !refreshResult.tokens) {
          console.error(
            "[Booklore Uploader] Token refresh failed:",
            refreshResult.error,
          );
          return null;
        }

        // Update tokens in database
        await bookloreSettingsService.updateTokens(refreshResult.tokens);

        console.log("[Booklore Uploader] Token refreshed successfully");
        return refreshResult.tokens.accessToken;
      }

      return settings.accessToken;
    } catch (error) {
      console.error("[Booklore Uploader] Error ensuring fresh token:", error);
      return null;
    }
  }

  /**
   * Upload a file to Booklore
   * @param filePath - Absolute path to the file to upload
   * @returns Result with success status and optional error message
   */
  async uploadFile(
    filePath: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if Booklore is enabled
      const canUpload = await this.canUpload();
      if (!canUpload) {
        return {
          success: false,
          error: "Booklore integration is not enabled or not configured",
        };
      }

      // Get settings
      const settings = await bookloreSettingsService.getSettings();
      if (
        !settings ||
        !settings.baseUrl ||
        !settings.libraryId ||
        !settings.pathId
      ) {
        return {
          success: false,
          error: "Booklore settings are incomplete",
        };
      }

      // Ensure we have a fresh access token
      const accessToken = await this.ensureFreshToken();
      if (!accessToken) {
        return {
          success: false,
          error:
            "Failed to get valid access token. Please re-authenticate in Booklore settings.",
        };
      }

      // Check if file exists
      try {
        statSync(filePath);
      } catch (_error) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }

      // Upload to Booklore
      const result = await this.performUpload(
        filePath,
        settings.baseUrl,
        accessToken,
        settings.libraryId,
        settings.pathId,
      );

      return result;
    } catch (error: unknown) {
      console.error("[Booklore Uploader] Upload error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown upload error",
      };
    }
  }

  /**
   * Perform the actual upload using multipart/form-data
   */
  private async performUpload(
    filePath: string,
    baseUrl: string,
    token: string,
    libraryId: number,
    pathId: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const filename = basename(filePath);
      const fileStream = createReadStream(filePath);
      const fileStats = statSync(filePath);

      // Read file as buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(Buffer.from(chunk));
      }
      const fileBuffer = Buffer.concat(chunks);

      // Create FormData with file using built-in FormData (Node.js 18+)
      const formData = new FormData();
      const blob = new Blob([fileBuffer]);
      formData.append("file", blob, filename);

      // Construct upload URL with query parameters
      const uploadUrl = `${baseUrl}/api/v1/files/upload?libraryId=${libraryId}&pathId=${pathId}`;

      console.log(
        `[Booklore Uploader] Uploading ${filename} (${this.formatBytes(fileStats.size)}) to ${baseUrl}`,
      );

      // Perform upload
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData as BodyInit,
      });

      if (response.ok) {
        console.log(`[Booklore Uploader] Successfully uploaded ${filename}`);
        return { success: true };
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        console.error(
          `[Booklore Uploader] Upload failed with status ${response.status}: ${errorText}`,
        );
        return {
          success: false,
          error: `Upload failed: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error: unknown) {
      console.error("[Booklore Uploader] Perform upload error:", error);

      // Provide more detailed error messages
      let errorMsg =
        error instanceof Error ? error.message : "Unknown error during upload";

      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ECONNREFUSED") {
          errorMsg = `Connection refused. Is Booklore running at ${baseUrl}?`;
        } else if (nodeError.code === "ENOTFOUND") {
          errorMsg = `Cannot resolve hostname: ${baseUrl}`;
        } else if (nodeError.code === "ETIMEDOUT") {
          errorMsg = `Upload timeout. Booklore server not responding at ${baseUrl}`;
        } else if (error.message.includes("certificate")) {
          errorMsg = `SSL certificate error: ${error.message}`;
        }
      }

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Test connection to Booklore API
   * Validates that the base URL and access token work
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const settings = await bookloreSettingsService.getSettings();
    if (!settings || !settings.baseUrl) {
      return {
        success: false,
        message: "Booklore settings are not configured",
      };
    }

    // Ensure we have a fresh access token
    const accessToken = await this.ensureFreshToken();
    if (!accessToken) {
      return {
        success: false,
        message:
          "Failed to get valid access token. Please re-authenticate in Booklore settings.",
      };
    }

    const testUrl = `${settings.baseUrl}/api/v1/settings`;

    try {
      console.log(`[Booklore Uploader] Testing connection to ${testUrl}...`);

      const response = await fetch(testUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        return {
          success: true,
          message: "Successfully connected to Booklore API",
        };
      } else {
        const errorText = await response.text().catch(() => "");
        console.error(
          `[Booklore Uploader] Connection failed: ${response.status} ${response.statusText}`,
        );
        return {
          success: false,
          message: `Connection failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.substring(0, 100)}` : ""}`,
        };
      }
    } catch (error: unknown) {
      console.error("[Booklore Uploader] Test connection error:", error);

      // Provide more detailed error messages for common issues
      let message =
        error instanceof Error
          ? error.message
          : "Failed to connect to Booklore";

      if (error instanceof Error) {
        const nodeError = error as NodeJS.ErrnoException & {
          cause?: { message?: string };
        };
        if (nodeError.code === "ECONNREFUSED") {
          message = `Connection refused. Is Booklore running at ${settings.baseUrl}? Check the URL and port.`;
        } else if (
          nodeError.code === "ENOTFOUND" ||
          nodeError.code === "EAI_AGAIN"
        ) {
          message = `Cannot resolve hostname. Check the baseUrl: ${settings.baseUrl}`;
        } else if (
          nodeError.code === "CERT_HAS_EXPIRED" ||
          nodeError.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
          error.message.includes("certificate")
        ) {
          message = `SSL/TLS certificate error. If using HTTPS with self-signed cert, you may need to set NODE_TLS_REJECT_UNAUTHORIZED=0 (not recommended for production). Error: ${error.message}`;
        } else if (
          nodeError.code === "ETIMEDOUT" ||
          error.message.includes("timeout")
        ) {
          message = `Connection timeout. Booklore server at ${settings.baseUrl} is not responding.`;
        } else if (nodeError.cause) {
          message = `${error.message} (Cause: ${nodeError.cause.message || nodeError.cause})`;
        }
      }

      return {
        success: false,
        message,
      };
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}

// Export singleton instance
export const bookloreUploader = new BookloreUploader();
