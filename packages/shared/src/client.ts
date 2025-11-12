import type { paths } from "./generated/api.js";

/**
 * Configuration for the API client
 */
export interface ClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
}

/**
 * Default configuration
 */
const defaultConfig: Required<ClientConfig> = {
  baseUrl: "http://localhost:8286",
  headers: {
    "Content-Type": "application/json",
  },
};

let clientConfig = { ...defaultConfig };

/**
 * Configure the API client
 */
export const configureClient = (config: ClientConfig) => {
  clientConfig = { ...defaultConfig, ...config };
};

/**
 * Get current client configuration
 */
export const getClientConfig = (): Required<ClientConfig> => ({
  ...clientConfig,
});

/**
 * HTTP Methods type (for future use)
 */
// type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Extract path parameters from a path string
 */
type PathParams<T extends string> =
  T extends `${infer _Start}{${infer Param}}${infer Rest}`
    ? { [K in Param | keyof PathParams<Rest>]: string }
    : {};

/**
 * Replace path parameters in a URL
 */
const replacePathParams = (
  path: string,
  params: Record<string, string>,
): string => {
  return Object.entries(params).reduce(
    (url, [key, value]) => url.replace(`{${key}}`, encodeURIComponent(value)),
    path,
  );
};

/**
 * Build query string from object
 */
const buildQueryString = (params: Record<string, unknown>): string => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
    } else {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

/**
 * API Error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Typed fetch wrapper
 */
export async function apiFetch<TResponse = unknown>(
  path: string,
  options: RequestInit & {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    timeout?: number;
  } = {},
): Promise<TResponse> {
  const { params, query, timeout = 30000, ...fetchOptions } = options;

  // Replace path parameters
  let url = params ? replacePathParams(path, params) : path;

  // Add query string
  if (query) {
    url += buildQueryString(query);
  }

  // Build full URL
  const fullUrl = url.startsWith("http")
    ? url
    : `${clientConfig.baseUrl}${url}`;

  // Merge headers
  const headers = {
    ...clientConfig.headers,
    ...fetchOptions.headers,
  };

  // Merge timeout signal with any existing signal (e.g., from React Query)
  // Check if AbortSignal.any is available (requires modern browser)
  let combinedSignal: AbortSignal;

  if (typeof AbortSignal.any === "function") {
    const timeoutSignal = AbortSignal.timeout(timeout);
    const signals = [timeoutSignal];
    if (fetchOptions.signal) {
      signals.push(fetchOptions.signal);
    }
    combinedSignal = AbortSignal.any(signals);
  } else {
    // Fallback for older browsers
    const controller = new AbortController();
    combinedSignal = controller.signal;

    // Set timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    // Listen to existing signal if present
    if (fetchOptions.signal) {
      if (fetchOptions.signal.aborted) {
        controller.abort();
      } else {
        fetchOptions.signal.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
      }
    }
  }

  try {
    // Make request
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      headers,
      signal: combinedSignal,
    });

    // Handle errors
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorResponse: unknown;

      try {
        errorResponse = await response.json();
        if (
          errorResponse &&
          typeof errorResponse === "object" &&
          "error" in errorResponse
        ) {
          errorMessage = String(errorResponse.error);
        }
      } catch {
        // Response is not JSON
      }

      throw new ApiError(errorMessage, response.status, errorResponse);
    }

    // Parse response
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return await response.json();
    }

    return undefined as TResponse;
  } catch (error) {
    // Handle abort errors (timeout or cancellation)
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Request cancelled or timeout", 408);
    }

    throw error;
  }
}

/**
 * Type-safe GET request
 */
export function get<
  TPath extends keyof paths,
  TResponse = paths[TPath] extends {
    get: { responses: { 200: { content: { "application/json": infer R } } } };
  }
    ? R
    : unknown,
>(
  path: TPath,
  options?: {
    params?: PathParams<TPath & string>;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): Promise<TResponse> {
  return apiFetch<TResponse>(path as string, {
    method: "GET",
    ...options,
  });
}

/**
 * Type-safe POST request
 */
export function post<
  TPath extends keyof paths,
  TBody = unknown,
  TResponse = paths[TPath] extends {
    post: { responses: { 200: { content: { "application/json": infer R } } } };
  }
    ? R
    : unknown,
>(
  path: TPath,
  body?: TBody,
  options?: {
    params?: PathParams<TPath & string>;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): Promise<TResponse> {
  return apiFetch<TResponse>(path as string, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });
}

/**
 * Type-safe PUT request
 */
export function put<
  TPath extends keyof paths,
  TBody = unknown,
  TResponse = paths[TPath] extends {
    put: { responses: { 200: { content: { "application/json": infer R } } } };
  }
    ? R
    : unknown,
>(
  path: TPath,
  body?: TBody,
  options?: {
    params?: PathParams<TPath & string>;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): Promise<TResponse> {
  return apiFetch<TResponse>(path as string, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });
}

/**
 * Type-safe DELETE request
 */
export function del<
  TPath extends keyof paths,
  TResponse = paths[TPath] extends {
    delete: {
      responses: { 200: { content: { "application/json": infer R } } };
    };
  }
    ? R
    : unknown,
>(
  path: TPath,
  options?: {
    params?: PathParams<TPath & string>;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): Promise<TResponse> {
  return apiFetch<TResponse>(path as string, {
    method: "DELETE",
    ...options,
  });
}

/**
 * Export a default client instance
 */
export const client = {
  get,
  post,
  put,
  delete: del,
  configure: configureClient,
  getConfig: getClientConfig,
};
