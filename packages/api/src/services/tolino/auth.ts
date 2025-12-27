import { randomUUID } from "crypto";
import {
  getReseller,
  getResellerApiId,
  type ResellerId,
  type ResellerConfig,
} from "./resellers.js";
import { logger } from "../../utils/logger.js";
import { CookieJar } from "tough-cookie";

// Token refresh buffer (refresh 5 minutes before expiry)
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;

export interface TolinoTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  expiresAt: number; // unix timestamp ms
  tokenType: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

/**
 * Tolino Authentication Service
 * Handles login via direct form submission and token management
 */
class TolinoAuthService {
  /**
   * Perform full login flow and obtain tokens
   * Submits credentials to predefined login endpoints,
   * follows redirects to get OAuth code, then exchanges for tokens.
   */
  async login(
    email: string,
    password: string,
    resellerId: ResellerId,
  ): Promise<TolinoTokens> {
    const reseller = getReseller(resellerId);

    logger.info(
      `[Tolino Auth] Starting login for ${email} with reseller ${reseller.name}`,
    );

    try {
      // Step 1: Get the OAuth authorization code by scraping login flow
      const authCode = await this.scrapeLoginFlow(reseller, email, password);

      // Step 2: Exchange authorization code for tokens
      const tokens = await this.exchangeCodeForTokens(authCode, reseller);

      logger.info(`[Tolino Auth] Login successful for ${email}`);

      return tokens;
    } catch (error) {
      logger.error(`[Tolino Auth] Login failed for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Perform login and obtain OAuth authorization code
   * Routes to appropriate login method based on reseller config
   */
  private async scrapeLoginFlow(
    reseller: ResellerConfig,
    email: string,
    password: string,
  ): Promise<string> {
    // Use JWT API login for resellers that support it (Hugendubel)
    if (reseller.jwtApi) {
      return this.jwtApiLogin(reseller, email, password);
    }

    // Use REST API login for resellers that support it (Buchhandlung.de)
    if (reseller.restApi) {
      return this.restApiLogin(reseller, email, password);
    }

    // Fall back to form-based login
    return this.formBasedLogin(reseller, email, password);
  }

  /**
   * REST API based login (used by Buchhandlung.de)
   * Uses direct API calls instead of form scraping
   */
  private async restApiLogin(
    reseller: ResellerConfig,
    email: string,
    password: string,
  ): Promise<string> {
    const restApi = reseller.restApi!;
    const cookieJar = new CookieJar();

    // Helper to get cookies as header string
    const getCookieHeader = async (url: string): Promise<string> => {
      const cookies = await cookieJar.getCookies(url);
      return cookies.map((c) => `${c.key}=${c.value}`).join("; ");
    };

    // Helper to store cookies from response
    const storeCookies = async (
      response: Response,
      url: string,
    ): Promise<void> => {
      const setCookies = response.headers.getSetCookie?.() || [];
      for (const cookie of setCookies) {
        try {
          await cookieJar.setCookie(cookie, url);
        } catch {
          // Ignore invalid cookies
        }
      }
    };

    // Helper to get specific cookie value
    const getCookieValue = async (
      url: string,
      name: string,
    ): Promise<string | null> => {
      const cookies = await cookieJar.getCookies(url);
      const cookie = cookies.find((c) => c.key === name);
      return cookie?.value || null;
    };

    // Generate nonce for API calls
    const generateNonce = (): string => {
      return Math.random().toString(36).substring(2, 15);
    };

    const baseUrl = restApi.baseUrl;

    // Step 1: Fetch the login page to get initial cookies
    logger.debug(
      `[Tolino Auth] Fetching login page for cookies: ${reseller.loginFormUrl}`,
    );

    const loginPageResponse = await fetch(reseller.loginFormUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });

    if (!loginPageResponse.ok) {
      throw new Error(
        `Failed to fetch login page: ${loginPageResponse.status}`,
      );
    }

    await storeCookies(loginPageResponse, baseUrl);
    logger.debug(`[Tolino Auth] Got initial cookies`);

    // Step 2: Call the login API endpoint
    const loginUrl = `${baseUrl}${restApi.loginEndpoint}`;
    const loginParams = new URLSearchParams();
    loginParams.append("username", email);
    loginParams.append("password", password);
    loginParams.append("aUrl", restApi.aUrl);
    loginParams.append("nonce", generateNonce());
    if (restApi.switchToAffiliateId) {
      loginParams.append("switchToAffiliateId", restApi.switchToAffiliateId);
    }

    logger.debug(`[Tolino Auth] Calling login API: ${loginUrl}`);

    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        Origin: baseUrl,
        Referer: reseller.loginFormUrl,
        Cookie: await getCookieHeader(baseUrl),
      },
      body: loginParams.toString(),
    });

    await storeCookies(loginResponse, baseUrl);

    if (!loginResponse.ok) {
      const text = await loginResponse.text();
      logger.error(
        `[Tolino Auth] Login API failed: ${loginResponse.status} - ${text}`,
      );
      throw new Error("Login failed: Invalid email or password");
    }

    logger.debug(`[Tolino Auth] Login API successful`);

    // Step 3: Get the CSRF token from cookies
    const csrfToken = await getCookieValue(baseUrl, "csrfToken");
    if (!csrfToken) {
      throw new Error("Login succeeded but no CSRF token received");
    }

    logger.debug(`[Tolino Auth] Got CSRF token`);

    // Step 4: Generate authorization code
    const generateCodeUrl = `${baseUrl}${restApi.generateCodeEndpoint}`;
    const codeParams = new URLSearchParams();
    codeParams.append("client_id", reseller.clientId);
    codeParams.append("aUrl", restApi.aUrl);
    codeParams.append("nonce", generateNonce());

    logger.debug(
      `[Tolino Auth] Generating authorization code: ${generateCodeUrl}`,
    );

    const codeResponse = await fetch(generateCodeUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "*/*",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        Origin: baseUrl,
        Referer: reseller.loginFormUrl,
        Cookie: await getCookieHeader(baseUrl),
        "x-csrf-token": csrfToken,
      },
      body: codeParams.toString(),
    });

    if (!codeResponse.ok) {
      const text = await codeResponse.text();
      logger.error(
        `[Tolino Auth] Generate code failed: ${codeResponse.status} - ${text}`,
      );
      throw new Error("Failed to generate authorization code");
    }

    // Parse the response to get the authorization code
    // Response format: { result: { code: "..." }, resultText: "Success", ... }
    const codeData = (await codeResponse.json()) as {
      code?: string;
      authorizationCode?: string;
      result?: { code?: string };
    };
    const authCode =
      codeData.result?.code || codeData.code || codeData.authorizationCode;

    if (!authCode) {
      logger.error(`[Tolino Auth] No code in response:`, codeData);
      throw new Error("Authorization code not found in response");
    }

    logger.debug(`[Tolino Auth] Got authorization code`);
    return authCode;
  }

  /**
   * JWT API based login (used by Hugendubel)
   * Uses 2-step JWT flow: anonymous JWT → customer JWT → OAuth code
   */
  private async jwtApiLogin(
    reseller: ResellerConfig,
    email: string,
    password: string,
  ): Promise<string> {
    const jwtApi = reseller.jwtApi!;
    const baseUrl = jwtApi.baseUrl;

    // Step 1: Get anonymous JWT token
    const anonymousLoginUrl = `${baseUrl}${jwtApi.anonymousLoginEndpoint}`;
    const anonymousParams = new URLSearchParams();
    anonymousParams.append("username", jwtApi.anonymousUsername);

    logger.debug(
      `[Tolino Auth] Getting anonymous JWT from: ${anonymousLoginUrl}`,
    );

    const anonymousResponse = await fetch(anonymousLoginUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        Origin: baseUrl,
        Referer: reseller.loginFormUrl,
      },
      body: anonymousParams.toString(),
    });

    if (!anonymousResponse.ok) {
      const text = await anonymousResponse.text();
      logger.error(
        `[Tolino Auth] Anonymous JWT request failed: ${anonymousResponse.status} - ${text}`,
      );
      throw new Error("Failed to get anonymous token");
    }

    // Parse anonymous JWT from response
    // Hugendubel returns: { result: { accessToken: "...", refreshToken: "..." }, resultText: "Success" }
    const anonymousData = (await anonymousResponse.json()) as {
      token?: string;
      jwt?: string;
      access_token?: string;
      accessToken?: string;
      result?: { token?: string; accessToken?: string };
    };

    const anonymousJwt =
      anonymousData.token ||
      anonymousData.jwt ||
      anonymousData.access_token ||
      anonymousData.accessToken ||
      anonymousData.result?.accessToken ||
      anonymousData.result?.token;

    if (!anonymousJwt) {
      logger.error(
        `[Tolino Auth] No anonymous JWT in response:`,
        anonymousData,
      );
      throw new Error("Failed to get anonymous token");
    }

    logger.debug(`[Tolino Auth] Got anonymous JWT`);

    // Step 2: Exchange for customer JWT using user credentials
    const loginUrl = `${baseUrl}${jwtApi.loginEndpoint}`;
    const loginParams = new URLSearchParams();
    loginParams.append("username", email);
    loginParams.append("password", password);

    logger.debug(`[Tolino Auth] Exchanging for customer JWT at: ${loginUrl}`);

    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        Origin: baseUrl,
        Referer: reseller.loginFormUrl,
        Authorization: `Bearer ${anonymousJwt}`,
      },
      body: loginParams.toString(),
    });

    if (!loginResponse.ok) {
      const text = await loginResponse.text();
      logger.error(
        `[Tolino Auth] Customer JWT request failed: ${loginResponse.status} - ${text}`,
      );
      throw new Error("Login failed: Invalid email or password");
    }

    // Parse customer JWT from response
    // Hugendubel returns: { result: { accessToken: "...", refreshToken: "..." }, resultText: "Success" }
    const loginData = (await loginResponse.json()) as {
      token?: string;
      jwt?: string;
      access_token?: string;
      accessToken?: string;
      result?: { token?: string; accessToken?: string };
    };

    const customerJwt =
      loginData.token ||
      loginData.jwt ||
      loginData.access_token ||
      loginData.accessToken ||
      loginData.result?.accessToken ||
      loginData.result?.token;

    if (!customerJwt) {
      logger.error(`[Tolino Auth] No customer JWT in response:`, loginData);
      throw new Error("Login succeeded but no JWT token received");
    }

    logger.debug(`[Tolino Auth] Got customer JWT`);

    // Step 3: Generate authorization code using customer JWT
    const authorizeUrl = `${baseUrl}${jwtApi.authorizeEndpoint}`;
    const authParams = new URLSearchParams();
    authParams.append("client_id", reseller.clientId);

    logger.debug(
      `[Tolino Auth] Generating authorization code at: ${authorizeUrl}`,
    );

    const authorizeResponse = await fetch(authorizeUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        Origin: baseUrl,
        Referer: reseller.loginFormUrl,
        Authorization: `Bearer ${customerJwt}`,
      },
      body: authParams.toString(),
    });

    if (!authorizeResponse.ok) {
      const text = await authorizeResponse.text();
      logger.error(
        `[Tolino Auth] Authorization failed: ${authorizeResponse.status} - ${text}`,
      );
      throw new Error("Failed to generate authorization code");
    }

    // Parse the response to get the authorization code
    const codeData = (await authorizeResponse.json()) as {
      code?: string;
      authorizationCode?: string;
      result?: { code?: string };
    };
    const authCode =
      codeData.code || codeData.authorizationCode || codeData.result?.code;

    if (!authCode) {
      logger.error(`[Tolino Auth] No code in response:`, codeData);
      throw new Error("Authorization code not found in response");
    }

    logger.debug(`[Tolino Auth] Got authorization code`);
    return authCode;
  }

  /**
   * Form-based login (fallback, not used by main resellers)
   * Submits credentials via HTML form and follows redirects
   */
  private async formBasedLogin(
    reseller: ResellerConfig,
    email: string,
    password: string,
  ): Promise<string> {
    const cookieJar = new CookieJar();

    // Helper to get cookies as header string
    const getCookieHeader = async (url: string): Promise<string> => {
      const cookies = await cookieJar.getCookies(url);
      return cookies.map((c) => `${c.key}=${c.value}`).join("; ");
    };

    // Helper to store cookies from response
    const storeCookies = async (
      response: Response,
      url: string,
    ): Promise<void> => {
      const setCookies = response.headers.getSetCookie?.() || [];
      for (const cookie of setCookies) {
        try {
          await cookieJar.setCookie(cookie, url);
        } catch {
          // Ignore invalid cookies
        }
      }
    };

    // Step 1: Fetch the login page to get session cookies
    logger.debug(`[Tolino Auth] Fetching login page: ${reseller.loginFormUrl}`);

    const loginPageResponse = await fetch(reseller.loginFormUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });

    if (!loginPageResponse.ok) {
      throw new Error(
        `Failed to fetch login page: ${loginPageResponse.status}`,
      );
    }

    await storeCookies(loginPageResponse, reseller.loginFormUrl);
    logger.debug(`[Tolino Auth] Got login page, cookies stored`);

    // Step 2: Build form data with predefined field names
    const formData = new URLSearchParams();
    formData.append(reseller.loginForm.emailField, email);
    formData.append(reseller.loginForm.passwordField, password);

    // Add any extra fields required by this reseller
    if (reseller.loginForm.extraFields) {
      for (const [key, value] of Object.entries(
        reseller.loginForm.extraFields,
      )) {
        formData.append(key, value);
      }
    }

    // Step 3: Submit the login form (GET or POST based on reseller config)
    const method = reseller.loginForm.method || "POST";
    let currentUrl = reseller.loginPostUrl;

    // For GET requests, append form data as query parameters
    if (method === "GET") {
      const url = new URL(currentUrl);
      for (const [key, value] of formData.entries()) {
        url.searchParams.append(key, value);
      }
      currentUrl = url.toString();
    }

    logger.debug(
      `[Tolino Auth] Submitting login form (${method}) to: ${currentUrl}`,
    );

    let response = await fetch(currentUrl, {
      method: method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        Referer: loginPageResponse.url,
        Cookie: await getCookieHeader(currentUrl),
      },
      ...(method === "POST" ? { body: formData.toString() } : {}),
      redirect: "manual",
    });

    await storeCookies(response, currentUrl);

    // Step 4: Follow redirects until we find the OAuth code
    const maxRedirects = 15;
    let redirectCount = 0;

    while (
      response.status >= 300 &&
      response.status < 400 &&
      redirectCount < maxRedirects
    ) {
      const location = response.headers.get("location");
      if (!location) {
        break;
      }

      // Check if this redirect contains the OAuth code
      const redirectUrl = new URL(location, currentUrl);
      const code = redirectUrl.searchParams.get("code");

      if (code) {
        logger.debug(`[Tolino Auth] Found OAuth code in redirect`);
        return code;
      }

      // Continue following redirect
      currentUrl = redirectUrl.toString();
      logger.debug(`[Tolino Auth] Following redirect to: ${currentUrl}`);

      response = await fetch(currentUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Cookie: await getCookieHeader(currentUrl),
        },
        redirect: "manual",
      });

      await storeCookies(response, currentUrl);
      redirectCount++;
    }

    // Check final URL for code
    const finalUrl = new URL(response.url || currentUrl);
    const code = finalUrl.searchParams.get("code");
    if (code) {
      return code;
    }

    // If we got here without a code, login probably failed
    const responseHtml = await response.text();

    // Check for common error indicators
    if (
      responseHtml.includes("incorrect") ||
      responseHtml.includes("falsch") ||
      responseHtml.includes("invalid") ||
      responseHtml.includes("ungültig") ||
      responseHtml.includes("Fehler") ||
      responseHtml.includes("error")
    ) {
      throw new Error("Login failed: Invalid email or password");
    }

    logger.debug(
      `[Tolino Auth] Final URL: ${finalUrl}, Status: ${response.status}`,
    );
    throw new Error("Could not obtain OAuth authorization code after login");
  }

  /**
   * Exchange OAuth authorization code for access and refresh tokens
   */
  private async exchangeCodeForTokens(
    code: string,
    reseller: ResellerConfig,
  ): Promise<TolinoTokens> {
    const params = new URLSearchParams();
    params.append("client_id", reseller.clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("scope", reseller.scope);
    params.append("redirect_uri", "https://webreader.mytolino.com/library/");

    logger.debug(
      `[Tolino Auth] Exchanging code for tokens at: ${reseller.tokenUrl}`,
    );

    const response = await fetch(reseller.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${text}`);
    }

    const data = (await response.json()) as TokenResponse;

    return this.parseTokenResponse(data);
  }

  /**
   * Refresh an expired access token
   */
  async refreshToken(
    refreshToken: string,
    resellerId: ResellerId,
  ): Promise<TolinoTokens> {
    const reseller = getReseller(resellerId);

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", refreshToken);
    params.append("client_id", reseller.clientId);
    params.append("scope", reseller.scope);

    logger.debug(
      `[Tolino Auth] Refreshing token at: ${reseller.tokenRefreshUrl}`,
    );

    const response = await fetch(reseller.tokenRefreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${text}`);
    }

    const data = (await response.json()) as TokenResponse;

    return this.parseTokenResponse(data);
  }

  /**
   * Parse token response
   */
  private parseTokenResponse(data: TokenResponse): TolinoTokens {
    const now = Date.now();
    const expiresIn = data.expires_in;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn,
      expiresAt: now + expiresIn * 1000,
      tokenType: data.token_type,
    };
  }

  /**
   * Check if token needs refresh
   */
  shouldRefreshToken(expiresAt: number): boolean {
    return Date.now() >= expiresAt - TOKEN_REFRESH_BUFFER;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt;
  }

  /**
   * Generate a hardware ID for device registration
   */
  generateHardwareId(): string {
    return randomUUID();
  }

  /**
   * Register device with Tolino Cloud
   */
  async registerDevice(
    accessToken: string,
    hardwareId: string,
    resellerId: ResellerId,
  ): Promise<void> {
    const apiResellerId = getResellerApiId(resellerId);

    logger.debug(
      `[Tolino Auth] Registering device with hardware ID: ${hardwareId}`,
    );

    const response = await fetch("https://api.pageplace.de/v1/devices", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        hardware_id: hardwareId,
        hardware_type: "TOLINO_WEBREADER",
        client_type: "TOLINO_WEBREADER",
        client_version: "5.13.0",
        reseller_id: apiResellerId,
        t_auth_token: accessToken,
      },
      body: JSON.stringify({
        hardware_name: "tolino Webreader 5.13.0",
      }),
    });

    if (!response.ok) {
      // Device might already be registered, which is fine
      if (response.status === 409) {
        logger.debug(`[Tolino Auth] Device already registered`);
        return;
      }

      const text = await response.text();
      throw new Error(
        `Device registration failed: ${response.status} - ${text}`,
      );
    }

    logger.info(`[Tolino Auth] Device registered successfully`);
  }
}

// Export singleton instance
export const tolinoAuthService = new TolinoAuthService();
