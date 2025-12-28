import { spawn } from "child_process";
import { existsSync } from "fs";
import { unlink, rename } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger.js";

// Supported input formats that Calibre can convert from
const CALIBRE_INPUT_FORMATS = [
  "azw",
  "azw3",
  "azw4",
  "cbz",
  "cbr",
  "cb7",
  "cbc",
  "chm",
  "djvu",
  "docx",
  "epub",
  "fb2",
  "fbz",
  "html",
  "htmlz",
  "lit",
  "lrf",
  "mobi",
  "odt",
  "pdf",
  "pdb",
  "pml",
  "prc",
  "rb",
  "rtf",
  "snb",
  "tcr",
  "txt",
  "txtz",
] as const;

// Supported output formats that Calibre can convert to
const CALIBRE_OUTPUT_FORMATS = ["epub", "pdf", "mobi", "azw3"] as const;

export type CalibreInputFormat = (typeof CALIBRE_INPUT_FORMATS)[number];
export type CalibreOutputFormat = (typeof CALIBRE_OUTPUT_FORMATS)[number];

// Calibre folder path from environment (e.g., /Applications/calibre.app/Contents/MacOS)
const CALIBRE_PATH = process.env.CALIBRE_PATH;

/**
 * Get full path to a Calibre binary
 * If CALIBRE_PATH is set, joins it with the binary name
 * Otherwise returns just the binary name (expects it in PATH)
 */
function getCalibreBinary(name: string): string {
  return CALIBRE_PATH ? join(CALIBRE_PATH, name) : name;
}

/**
 * Calibre Service
 * Handles ebook format conversion using Calibre CLI (ebook-convert)
 * This is a standalone service that can be reused across features
 */
class CalibreService {
  private availabilityCache: {
    available: boolean;
    version: string | null;
  } | null = null;
  private availabilityCacheTime = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1 minute

  /**
   * Check if Calibre CLI is available
   */
  async isAvailable(): Promise<boolean> {
    const status = await this.getStatus();
    return status.available;
  }

  /**
   * Get Calibre CLI status and version
   */
  async getStatus(): Promise<{ available: boolean; version: string | null }> {
    // Check cache
    if (
      this.availabilityCache &&
      Date.now() - this.availabilityCacheTime < this.CACHE_TTL
    ) {
      return this.availabilityCache;
    }

    try {
      const version = await this.getVersion();
      this.availabilityCache = { available: true, version };
      this.availabilityCacheTime = Date.now();
      return this.availabilityCache;
    } catch {
      this.availabilityCache = { available: false, version: null };
      this.availabilityCacheTime = Date.now();
      return this.availabilityCache;
    }
  }

  /**
   * Get Calibre version
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const proc = spawn(getCalibreBinary("ebook-convert"), ["--version"], {
        timeout: 10000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          // Extract version from output like "ebook-convert (calibre 7.0.0)"
          const match = stdout.match(/calibre\s+(\d+\.\d+\.\d+)/i);
          resolve(match ? match[1] : stdout.trim());
        } else {
          reject(
            new Error(`ebook-convert exited with code ${code}: ${stderr}`),
          );
        }
      });

      proc.on("error", (error) => {
        logger.debug(`Calibre CLI not available: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Get supported input formats
   */
  getSupportedInputFormats(): string[] {
    return [...CALIBRE_INPUT_FORMATS];
  }

  /**
   * Get supported output formats
   */
  getSupportedOutputFormats(): string[] {
    return [...CALIBRE_OUTPUT_FORMATS];
  }

  /**
   * Check if a format conversion is supported
   */
  canConvert(inputFormat: string, outputFormat: string): boolean {
    const normalizedInput = inputFormat.toLowerCase().replace(/^\./, "");
    const normalizedOutput = outputFormat.toLowerCase().replace(/^\./, "");

    const inputSupported = CALIBRE_INPUT_FORMATS.includes(
      normalizedInput as CalibreInputFormat,
    );
    const outputSupported = CALIBRE_OUTPUT_FORMATS.includes(
      normalizedOutput as CalibreOutputFormat,
    );

    return inputSupported && outputSupported;
  }

  /**
   * Check if a format needs conversion to be compatible with Tolino (EPUB/PDF only)
   */
  needsConversionForTolino(format: string): boolean {
    const normalized = format.toLowerCase().replace(/^\./, "");
    return normalized !== "epub" && normalized !== "pdf";
  }

  /**
   * Convert a book to a different format
   * @param inputPath Path to the input file
   * @param outputFormat Target format (epub, pdf, mobi, azw3)
   * @param outputDir Optional output directory (defaults to same directory as input)
   * @returns Path to the converted file
   */
  async convert(
    inputPath: string,
    outputFormat: CalibreOutputFormat,
    outputDir?: string,
  ): Promise<string> {
    // Validate input file exists
    if (!existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }

    // Determine input format
    const inputFormat = extname(inputPath).toLowerCase().slice(1);
    if (!this.canConvert(inputFormat, outputFormat)) {
      throw new Error(`Cannot convert from ${inputFormat} to ${outputFormat}`);
    }

    // Generate output path
    const inputBasename = basename(inputPath, extname(inputPath));
    const outputDirectory = outputDir || dirname(inputPath);
    const outputFilename = `${inputBasename}_converted_${randomUUID().slice(0, 8)}.${outputFormat}`;
    const outputPath = join(outputDirectory, outputFilename);

    logger.info(`Converting ${inputPath} to ${outputFormat}...`);

    return new Promise((resolve, reject) => {
      const args = [inputPath, outputPath];

      const proc = spawn(getCalibreBinary("ebook-convert"), args, {
        timeout: 5 * 60 * 1000, // 5 minute timeout for conversions
      });

      let stderr = "";

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        // Log progress lines
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            logger.debug(`[calibre] ${line.trim()}`);
          }
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          // Verify output file was created
          if (existsSync(outputPath)) {
            logger.info(`Conversion complete: ${outputPath}`);
            resolve(outputPath);
          } else {
            reject(new Error("Conversion completed but output file not found"));
          }
        } else {
          reject(new Error(`Conversion failed with code ${code}: ${stderr}`));
        }
      });

      proc.on("error", (error) => {
        reject(new Error(`Failed to start ebook-convert: ${error.message}`));
      });
    });
  }

  /**
   * Normalize an EPUB file for Kindle compatibility
   * Performs epub->epub conversion which cleans up encoding issues and malformed EPUBs
   * The file is normalized in-place (original replaced with normalized version)
   * @param inputPath Path to the EPUB file to normalize
   * @returns The same path (file is normalized in-place)
   */
  async normalizeEpub(inputPath: string): Promise<string> {
    // Validate input exists
    if (!existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }

    // Validate it's an EPUB
    const ext = extname(inputPath).toLowerCase();
    if (ext !== ".epub") {
      throw new Error(`Not an EPUB file: ${inputPath}`);
    }

    // Generate temp output path
    const inputBasename = basename(inputPath, ext);
    const inputDir = dirname(inputPath);
    const tempOutput = join(
      inputDir,
      `${inputBasename}_normalized_${randomUUID().slice(0, 8)}.epub`,
    );

    logger.info(`Normalizing EPUB: ${inputPath}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(
        getCalibreBinary("ebook-convert"),
        [inputPath, tempOutput],
        {
          timeout: 5 * 60 * 1000, // 5 minute timeout
        },
      );

      let stderr = "";

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", async (code) => {
        if (code === 0 && existsSync(tempOutput)) {
          try {
            // Replace original with normalized version
            await unlink(inputPath);
            await rename(tempOutput, inputPath);
            logger.info(`EPUB normalized successfully: ${inputPath}`);
            resolve(inputPath);
          } catch (err) {
            // Clean up temp file on error
            if (existsSync(tempOutput)) {
              await unlink(tempOutput).catch(() => {});
            }
            reject(
              new Error(
                `Failed to replace original file: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
          }
        } else {
          // Clean up temp file on failure
          if (existsSync(tempOutput)) {
            await unlink(tempOutput).catch(() => {});
          }
          reject(
            new Error(`EPUB normalization failed with code ${code}: ${stderr}`),
          );
        }
      });

      proc.on("error", (error) => {
        reject(new Error(`Failed to start ebook-convert: ${error.message}`));
      });
    });
  }
}

// Export singleton instance
export const calibreService = new CalibreService();
