type LogLevel = "info" | "warn" | "error" | "success" | "debug";

const colors = {
  info: "\x1b[36m", // Cyan
  warn: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  success: "\x1b[32m", // Green
  debug: "\x1b[90m", // Gray
  reset: "\x1b[0m",
};

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, metadata?: unknown) {
  const color = colors[level];
  const timestamp = formatTimestamp();
  const prefix = `${color}[${level.toUpperCase()}]${colors.reset} ${timestamp}`;

  if (metadata !== undefined) {
    console.log(`${prefix} ${message}`, metadata);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Extract error message from unknown error type
 * @param error - Unknown error object
 * @param fallback - Fallback message if error is not an Error instance
 * @returns Error message string
 */
export function getErrorMessage(
  error: unknown,
  fallback = "Unknown error",
): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}

export const logger = {
  info: (message: string, metadata?: unknown) => log("info", message, metadata),
  warn: (message: string, metadata?: unknown) => log("warn", message, metadata),
  error: (message: string, metadata?: unknown) =>
    log("error", message, metadata),
  success: (message: string, metadata?: unknown) =>
    log("success", message, metadata),
  debug: (message: string, metadata?: unknown) =>
    log("debug", message, metadata),
};
