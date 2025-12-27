/**
 * Tolino Reseller Configuration
 * Based on tolino-webreader integration
 *
 * Each reseller has different OAuth endpoints and configurations.
 * All resellers use the same Tolino Cloud API for book upload.
 */

export type ResellerId = "buchhandlung" | "hugendubel";

export interface LoginFormConfig {
  emailField: string;
  passwordField: string;
  extraFields?: Record<string, string>;
  method?: "GET" | "POST"; // Default is POST
}

// REST API configuration for resellers that use API-based login (e.g., Buchhandlung.de)
export interface RestApiConfig {
  baseUrl: string;
  loginEndpoint: string;
  generateCodeEndpoint: string;
  // Extra parameters for API calls
  aUrl: string;
  switchToAffiliateId?: string;
}

// JWT API configuration for resellers that use JWT-based login (e.g., Hugendubel)
export interface JwtApiConfig {
  baseUrl: string;
  anonymousLoginEndpoint: string; // First step: get anonymous JWT
  anonymousUsername: string; // Username for anonymous login (e.g., "Hudu-Mobile-Shop-Vollsortiment")
  loginEndpoint: string; // Second step: exchange for customer JWT
  authorizeEndpoint: string; // Third step: get OAuth code
}

export interface ResellerConfig {
  id: ResellerId;
  name: string;
  country: string;
  // OAuth configuration
  clientId: string;
  scope: string;
  // Login URLs
  loginFormUrl: string; // URL to GET the login form (for cookies/CSRF)
  loginPostUrl: string; // URL to POST login credentials
  tokenUrl: string;
  tokenRefreshUrl: string;
  // Login form configuration (for form-based login)
  loginForm: LoginFormConfig;
  loginCookie: string; // Cookie name that indicates successful login
  // REST API configuration (for API-based login)
  restApi?: RestApiConfig;
  // JWT API configuration (for JWT-based login like Hugendubel)
  jwtApi?: JwtApiConfig;
}

export const RESELLERS: Record<ResellerId, ResellerConfig> = {
  buchhandlung: {
    id: "buchhandlung",
    name: "Buchhandlung.de",
    country: "Germany",
    clientId: "meinebuchhandlung0501html5readerV0001",
    scope: "e-publishing",
    loginFormUrl:
      "https://lore.shop-asp.de/shop/kundenkonto/oauth/authorize?client_id=meinebuchhandlung0501html5readerV0001&response_type=code&scope=e-publishing&redirect_uri=https://webreader.mytolino.com/library/",
    loginPostUrl:
      "https://lore.shop-asp.de/shop/kundenkonto/login?client_id=meinebuchhandlung0501html5readerV0001&response_type=code&scope=e-publishing&redirect_uri=https://webreader.mytolino.com/library/",
    // Token URL is at /oauth/token, not /shop/kundenkonto/oauth/token
    tokenUrl: "https://lore.shop-asp.de/oauth/token",
    tokenRefreshUrl: "https://lore.shop-asp.de/oauth/token",
    loginForm: {
      emailField: "email",
      passwordField: "password",
      method: "GET",
    },
    loginCookie: "JSESSIONID",
    // Uses REST API for login instead of form scraping
    restApi: {
      baseUrl: "https://lore.shop-asp.de",
      loginEndpoint: "/wsapi/rest/v1/authentication/customerlogintolino",
      generateCodeEndpoint:
        "/wsapi/rest/v1/oauthinternal/generateauthorizationcode",
      aUrl: "100001",
      switchToAffiliateId: "90009739",
    },
  },
  hugendubel: {
    id: "hugendubel",
    name: "Hugendubel",
    country: "Germany",
    clientId: "4c20de744aa8b83b79b692524c7ec6ae",
    scope: "ebook_library",
    loginFormUrl:
      "https://www.hugendubel.de/oauth/authorize?client_id=4c20de744aa8b83b79b692524c7ec6ae&response_type=code&scope=ebook_library&redirect_uri=https://webreader.mytolino.com/library/",
    loginPostUrl:
      "https://www.hugendubel.de/oauth/authorize?client_id=4c20de744aa8b83b79b692524c7ec6ae&response_type=code&scope=ebook_library&redirect_uri=https://webreader.mytolino.com/library/",
    tokenUrl: "https://www.hugendubel.de/oauth/token",
    tokenRefreshUrl: "https://www.hugendubel.de/oauth/token",
    loginForm: {
      emailField: "email",
      passwordField: "password",
    },
    loginCookie: "JSESSIONID",
    // Hugendubel uses 2-step JWT API: anonymous JWT → customer JWT → OAuth code
    jwtApi: {
      baseUrl: "https://www.hugendubel.de",
      anonymousLoginEndpoint: "/rest/v1/authentication/anonymousloginjwt",
      anonymousUsername: "Hudu-Mobile-Shop-Vollsortiment",
      loginEndpoint: "/rest/v1/authentication/customerloginjwt",
      authorizeEndpoint: "/rest/v1/oauthinternal/authorize/code",
    },
  },
};

// Reseller IDs for the Tolino Cloud API
export const RESELLER_IDS: Record<ResellerId, string> = {
  buchhandlung: "80",
  hugendubel: "13",
};

/**
 * Get reseller configuration by ID
 */
export function getReseller(id: ResellerId): ResellerConfig {
  const reseller = RESELLERS[id];
  if (!reseller) {
    throw new Error(`Unknown reseller: ${id}`);
  }
  return reseller;
}

/**
 * Get reseller API ID for Tolino Cloud requests
 */
export function getResellerApiId(id: ResellerId): string {
  const apiId = RESELLER_IDS[id];
  if (!apiId) {
    throw new Error(`Unknown reseller: ${id}`);
  }
  return apiId;
}

/**
 * Get all resellers for display
 */
export function getAllResellers(): Array<{
  id: ResellerId;
  name: string;
  country: string;
}> {
  return Object.values(RESELLERS).map(({ id, name, country }) => ({
    id,
    name,
    country,
  }));
}
