import { rename, access, mkdir, stat, unlink, copyFile } from "fs/promises";
import { join, basename } from "path";
import { logger } from "./logger.js";

const INGEST_FOLDER = process.env.INGEST_FOLDER || "./final-downloads";

export class FileManager {
  /**
   * Move file with cross-filesystem support.
   * First tries atomic rename, falls back to copy+delete if crossing filesystems.
   */
  private async moveFile(source: string, destination: string): Promise<void> {
    try {
      await rename(source, destination);
    } catch (error: unknown) {
      // EXDEV error means crossing filesystem boundaries
      const isExdevError =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "EXDEV";

      if (isExdevError) {
        logger.info("Cross-filesystem move detected, using copy+delete");
        await copyFile(source, destination);
        await unlink(source);
      } else {
        throw error;
      }
    }
  }
  async ensureDownloadFolder(): Promise<void> {
    try {
      await mkdir(INGEST_FOLDER, { recursive: true });
    } catch (error) {
      logger.error("Failed to create download folder:", error);
      throw error;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    try {
      const stats = await stat(path);
      return stats.size;
    } catch (error) {
      logger.error(`Failed to get file size for ${path}:`, error);
      return 0;
    }
  }

  async moveToFinalDestination(tempPath: string): Promise<string> {
    try {
      // Ensure download folder exists
      await this.ensureDownloadFolder();

      // Check if source file exists
      const exists = await this.fileExists(tempPath);
      if (!exists) {
        throw new Error(`Source file does not exist: ${tempPath}`);
      }

      // Use the original filename from the download server (already in tempPath)
      const filename = basename(tempPath);
      const finalPath = join(INGEST_FOLDER, filename);

      logger.info(`Moving file: ${filename}`);

      // Check if destination already exists
      const destExists = await this.fileExists(finalPath);
      if (destExists) {
        // If destination exists, add timestamp to make unique
        const timestamp = Date.now();
        const parts = filename.split(".");
        const ext = parts.pop();
        const name = parts.join(".");
        const uniqueFilename = `${name}_${timestamp}.${ext}`;
        const uniquePath = join(INGEST_FOLDER, uniqueFilename);

        logger.warn(`Destination exists, using unique name: ${uniqueFilename}`);

        await this.moveFile(tempPath, uniquePath);
        logger.success(`File moved to: ${uniquePath}`);
        return uniquePath;
      }

      // Move file
      await this.moveFile(tempPath, finalPath);
      logger.success(`File moved to: ${finalPath}`);

      return finalPath;
    } catch (error) {
      logger.error(`Failed to move file from ${tempPath}:`, error);
      throw error;
    }
  }

  async validateDownload(
    path: string,
    expectedSize?: number,
  ): Promise<boolean> {
    try {
      const exists = await this.fileExists(path);
      if (!exists) {
        logger.error(`File does not exist: ${path}`);
        return false;
      }

      const actualSize = await this.getFileSize(path);

      if (actualSize === 0) {
        logger.error(`File is empty: ${path}`);
        return false;
      }

      if (expectedSize && actualSize !== expectedSize) {
        logger.warn(
          `File size mismatch: expected ${expectedSize}, got ${actualSize}`,
        );
        // Don't fail on size mismatch, just warn
        // Sometimes headers report incorrect size
      }

      return true;
    } catch (error) {
      logger.error(`Failed to validate download ${path}:`, error);
      return false;
    }
  }

  async deleteFile(path: string): Promise<boolean> {
    try {
      const exists = await this.fileExists(path);
      if (!exists) {
        logger.warn(`Cannot delete file, does not exist: ${path}`);
        return false;
      }

      await unlink(path);
      logger.info(`File deleted: ${path}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete file ${path}:`, error);
      throw error;
    }
  }
}

export const fileManager = new FileManager();
