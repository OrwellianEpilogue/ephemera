/**
 * Type-safe logger interfaces
 * Use these instead of `any` for logger metadata
 */

/**
 * Log levels supported by the logger
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Metadata that can be attached to log messages
 * Use Record<string, unknown> for flexible yet type-safe metadata
 */
export type LogMetadata = Record<string, unknown>;

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
  log(level: LogLevel, message: string, metadata?: LogMetadata): void;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string | Date;
  metadata?: LogMetadata;
}

/**
 * Type guard to check if a value is a valid log level
 */
export function isValidLogLevel(level: unknown): level is LogLevel {
  return (
    typeof level === "string" &&
    ["debug", "info", "warn", "error"].includes(level)
  );
}

/**
 * Sanitize metadata for logging
 * Removes undefined values and ensures type safety
 */
export function sanitizeLogMetadata(metadata: unknown): LogMetadata {
  if (typeof metadata !== "object" || metadata === null) {
    return {};
  }

  const sanitized: LogMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
