/**
 * Type-safe error handling utilities
 * Use these instead of `any` in catch blocks
 */

/**
 * Base error class for application errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Network/HTTP related errors
 */
export class NetworkError extends AppError {
  constructor(
    message: string,
    public readonly url?: string,
    statusCode?: number,
  ) {
    super(message, "NETWORK_ERROR", statusCode);
    this.name = "NetworkError";
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

/**
 * Type guard to check if an error has a message property
 */
export function isErrorWithMessage(
  error: unknown,
): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

/**
 * Type guard to check if an error has a stack property
 */
export function isErrorWithStack(error: unknown): error is { stack: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "stack" in error &&
    typeof (error as Record<string, unknown>).stack === "string"
  );
}

/**
 * Extract error message from unknown error
 * Use this in catch blocks: catch (error: unknown) { ... }
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unknown error occurred";
}

/**
 * Extract error stack from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isErrorWithStack(error)) {
    return error.stack;
  }
  return undefined;
}

/**
 * Safely serialize an error for logging or API responses
 */
export function serializeError(error: unknown): {
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
} {
  const message = getErrorMessage(error);
  const stack = getErrorStack(error);

  if (error instanceof AppError) {
    return {
      message,
      stack,
      code: error.code,
      statusCode: error.statusCode,
    };
  }

  return { message, stack };
}
