import type { VersionInfo } from "@ephemera/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GitHub repository configuration
const GITHUB_REPO = "OrwellianEpilogue/ephemera";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/tags`;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Cache for GitHub API response
let cachedResponse: VersionInfo | null = null;
let cacheTimestamp = 0;

/**
 * Get the current application version from package.json
 */
function getCurrentVersion(): string {
  try {
    // In development (tsx), __dirname is in src/services
    // In production (compiled), __dirname is in dist/services
    // Root package.json is always at ../../.. from packages/api/src/services
    const packagePath = join(__dirname, "../../..", "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
    return packageJson.version;
  } catch (error) {
    console.error("Failed to read package.json:", error);
    console.error("__dirname:", __dirname);
    console.error(
      "Tried path:",
      join(__dirname, "../../..", "..", "package.json"),
    );
    return "0.0.0";
  }
}

/**
 * Compare two semantic versions
 * Returns true if remoteVersion is newer than currentVersion
 */
function isNewerVersion(
  currentVersion: string,
  remoteVersion: string,
): boolean {
  // Remove 'v' prefix if present
  const cleanCurrent = currentVersion.replace(/^v/, "");
  const cleanRemote = remoteVersion.replace(/^v/, "");

  const currentParts = cleanCurrent.split(".").map(Number);
  const remoteParts = cleanRemote.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const current = currentParts[i] || 0;
    const remote = remoteParts[i] || 0;

    if (remote > current) return true;
    if (remote < current) return false;
  }

  return false; // Versions are equal
}

/**
 * Fetch the latest version from GitHub
 */
async function fetchLatestVersion(
  currentVersion: string,
): Promise<{ version: string; url: string } | null> {
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Ephemera-App",
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      console.error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const tags = (await response.json()) as Array<{ name: string }>;

    if (!Array.isArray(tags) || tags.length === 0) {
      console.error("No tags found in GitHub repository");
      return null;
    }

    // Get the first tag (most recent)
    const latestTag = tags[0].name;

    const currentTag = currentVersion.startsWith("v")
      ? currentVersion
      : `v${currentVersion}`;
    const compareUrl = `https://github.com/${GITHUB_REPO}/compare/${currentTag}...${latestTag}`;

    return {
      version: latestTag,
      url: compareUrl,
    };
  } catch (error) {
    console.error("Failed to fetch latest version from GitHub:", error);
    return null;
  }
}

/**
 * Get version information with caching
 */
export async function getVersionInfo(): Promise<VersionInfo> {
  const currentVersion = getCurrentVersion();
  const now = Date.now();

  // Check if cache is still valid
  if (cachedResponse && now - cacheTimestamp < CACHE_DURATION) {
    return cachedResponse;
  }

  // Fetch latest version from GitHub
  const latestInfo = await fetchLatestVersion(currentVersion);

  const versionInfo: VersionInfo = {
    currentVersion,
    latestVersion: latestInfo?.version || null,
    updateAvailable: latestInfo
      ? isNewerVersion(currentVersion, latestInfo.version)
      : false,
    releaseUrl: latestInfo?.url || null,
  };

  // Update cache
  cachedResponse = versionInfo;
  cacheTimestamp = now;

  return versionInfo;
}

export class VersionService {
  async getVersionInfo(): Promise<VersionInfo> {
    return getVersionInfo();
  }
}

export const versionService = new VersionService();
