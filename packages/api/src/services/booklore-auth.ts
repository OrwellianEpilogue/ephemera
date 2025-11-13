/**
 * Booklore Authentication Service
 * Handles login and token refresh using Booklore's API endpoints
 */

export interface BookloreTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresAt: number; // Access token expiry timestamp in milliseconds
  refreshTokenExpiresAt: number; // Refresh token expiry timestamp in milliseconds
}

/**
 * Decode a JWT token and extract the expiry time
 * @param token - JWT token string
 * @returns Expiry timestamp in milliseconds, or null if invalid
 */
function decodeJWTExpiry(token: string): number | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("[Booklore Auth] Invalid JWT format");
      return null;
    }

    // Decode base64url payload
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf-8");
    const decoded = JSON.parse(jsonPayload);

    // Extract exp claim (in seconds) and convert to milliseconds
    if (decoded.exp && typeof decoded.exp === "number") {
      return decoded.exp * 1000;
    }

    console.error("[Booklore Auth] JWT missing exp claim");
    return null;
  } catch (error) {
    console.error("[Booklore Auth] Failed to decode JWT:", error);
    return null;
  }
}

export interface LoginResponse {
  success: boolean;
  tokens?: BookloreTokens;
  error?: string;
}

export interface RefreshResponse {
  success: boolean;
  tokens?: BookloreTokens;
  error?: string;
}

/**
 * Authenticate with Booklore using username and password
 * @param baseUrl - Booklore base URL (e.g., http://192.168.7.3:6060)
 * @param username - Booklore username
 * @param password - Booklore password
 * @returns Login response with tokens or error
 */
export async function login(
  baseUrl: string,
  username: string,
  password: string,
): Promise<LoginResponse> {
  try {
    const loginUrl = `${baseUrl}/api/v1/auth/login`;

    console.log(`[Booklore Auth] Attempting login to ${baseUrl}`);

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
      }),
    });

    if (!response.ok) {
      let errorMessage = `${response.status} ${response.statusText}`;

      // Try to parse JSON error response
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          // Handle Booklore's error response format
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (typeof errorData === "string") {
            errorMessage = errorData;
          }
        } else {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
      } catch (parseError) {
        console.error(
          "[Booklore Auth] Failed to parse error response:",
          parseError,
        );
      }

      if (response.status === 400 || response.status === 401) {
        return {
          success: false,
          error: `Authentication failed: ${errorMessage}`,
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          error: "Booklore API endpoint not found. Please check the base URL.",
        };
      }

      if (response.status >= 500) {
        return {
          success: false,
          error: `Booklore server error: ${errorMessage}`,
        };
      }

      return {
        success: false,
        error: `Login failed: ${errorMessage}`,
      };
    }

    const data = await response.json();

    // Booklore returns Map<String, String> with tokens
    const accessToken = data.accessToken || data.access_token;
    const refreshToken = data.refreshToken || data.refresh_token;
    const tokenType = data.tokenType || data.token_type || "Bearer";

    if (!accessToken || !refreshToken) {
      return {
        success: false,
        error: "Login response missing tokens",
      };
    }

    // Decode JWT tokens to extract expiry times
    const accessTokenExpiresAt = decodeJWTExpiry(accessToken);
    const refreshTokenExpiresAt = decodeJWTExpiry(refreshToken);

    if (!accessTokenExpiresAt || !refreshTokenExpiresAt) {
      return {
        success: false,
        error: "Failed to decode token expiry times",
      };
    }

    console.log(
      `[Booklore Auth] Access token expires at: ${new Date(accessTokenExpiresAt).toISOString()}`,
    );
    console.log(
      `[Booklore Auth] Refresh token expires at: ${new Date(refreshTokenExpiresAt).toISOString()}`,
    );

    return {
      success: true,
      tokens: {
        accessToken,
        refreshToken,
        tokenType,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      },
    };
  } catch (error) {
    let errorMessage = "Login request failed";

    if (error instanceof Error) {
      if (
        error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENOTFOUND")
      ) {
        errorMessage = `Cannot connect to Booklore at ${baseUrl}. Please check the URL and ensure the server is running.`;
      } else {
        errorMessage = `Login request failed: ${error.message}`;
      }
    } else {
      errorMessage = `Login request failed: ${String(error)}`;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Refresh access token using refresh token
 * @param baseUrl - Booklore base URL
 * @param refreshToken - Current refresh token
 * @returns Refresh response with new tokens or error
 */
export async function refreshAccessToken(
  baseUrl: string,
  refreshToken: string,
): Promise<RefreshResponse> {
  try {
    const refreshUrl = `${baseUrl}/api/v1/auth/refresh`;

    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    if (!response.ok) {
      let errorMessage = `${response.status} ${response.statusText}`;

      // Try to parse JSON error response
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (typeof errorData === "string") {
            errorMessage = errorData;
          }
        } else {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
      } catch (parseError) {
        console.error(
          "[Booklore Auth] Failed to parse error response:",
          parseError,
        );
      }

      if (response.status === 401) {
        return {
          success: false,
          error: "Refresh token expired or invalid. Please re-authenticate.",
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          error: "Booklore API endpoint not found. Please check the base URL.",
        };
      }

      if (response.status >= 500) {
        return {
          success: false,
          error: `Booklore server error: ${errorMessage}`,
        };
      }

      return {
        success: false,
        error: `Token refresh failed: ${errorMessage}`,
      };
    }

    const data = await response.json();

    // Booklore returns Map<String, String> with new tokens
    const accessToken = data.accessToken || data.access_token;
    const newRefreshToken =
      data.refreshToken || data.refresh_token || refreshToken;
    const tokenType = data.tokenType || data.token_type || "Bearer";

    if (!accessToken) {
      return {
        success: false,
        error: "Refresh response missing access token",
      };
    }

    // Decode JWT tokens to extract expiry times
    const accessTokenExpiresAt = decodeJWTExpiry(accessToken);
    const refreshTokenExpiresAt = decodeJWTExpiry(newRefreshToken);

    if (!accessTokenExpiresAt || !refreshTokenExpiresAt) {
      return {
        success: false,
        error: "Failed to decode token expiry times",
      };
    }

    console.log(
      `[Booklore Auth] Access token expires at: ${new Date(accessTokenExpiresAt).toISOString()}`,
    );
    console.log(
      `[Booklore Auth] Refresh token expires at: ${new Date(refreshTokenExpiresAt).toISOString()}`,
    );

    return {
      success: true,
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Token refresh request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if a token is expired or will expire soon
 * @param expiresAt - Token expiration timestamp (milliseconds)
 * @param bufferMinutes - Refresh tokens this many minutes before expiration (default: 5)
 * @returns true if token is expired or will expire within buffer time
 */
export function isTokenExpired(
  expiresAt: number,
  bufferMinutes: number = 5,
): boolean {
  const bufferMs = bufferMinutes * 60 * 1000;
  return Date.now() >= expiresAt - bufferMs;
}

/**
 * Test connection to Booklore using provided credentials
 * @param baseUrl - Booklore base URL
 * @param username - Booklore username
 * @param password - Booklore password
 * @returns true if connection successful, false otherwise
 */
export async function testConnection(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ success: boolean; message: string }> {
  const loginResult = await login(baseUrl, username, password);

  if (loginResult.success) {
    return {
      success: true,
      message: "Successfully authenticated with Booklore API",
    };
  }

  return {
    success: false,
    message: loginResult.error || "Authentication failed",
  };
}
