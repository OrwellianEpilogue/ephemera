import { logger } from "../utils/logger.js";

// TypeScript types matching Booklore API response
export interface BooklorePath {
  id: number;
  path: string;
}

export interface BookloreLibrary {
  id: number;
  name: string;
  icon: string;
  watch: boolean;
  paths: BooklorePath[];
  scanMode: string;
  defaultBookFormat?: string;
}

/**
 * Fetch all libraries from Booklore API
 * @param baseUrl - The Booklore server base URL
 * @param accessToken - The access token for authentication
 * @returns Array of libraries with their paths
 */
export async function fetchLibraries(
  baseUrl: string,
  accessToken: string,
): Promise<BookloreLibrary[]> {
  try {
    const url = `${baseUrl}/api/v1/libraries`;
    logger.info(`[Booklore Client] Fetching libraries from ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `[Booklore Client] Failed to fetch libraries: ${response.status} ${response.statusText}`,
        errorText,
      );
      throw new Error(
        `Failed to fetch libraries: ${response.status} ${response.statusText}`,
      );
    }

    const libraries: BookloreLibrary[] = await response.json();
    logger.info(
      `[Booklore Client] Successfully fetched ${libraries.length} libraries`,
    );

    return libraries;
  } catch (error) {
    logger.error("[Booklore Client] Error fetching libraries:", error);
    throw error;
  }
}

/**
 * Validate that a library ID and path ID exist in the Booklore API
 * @param baseUrl - The Booklore server base URL
 * @param accessToken - The access token for authentication
 * @param libraryId - The library ID to validate
 * @param pathId - The path ID to validate
 * @returns True if valid, throws error if invalid
 */
export async function validateLibraryAndPath(
  baseUrl: string,
  accessToken: string,
  libraryId: number,
  pathId: number,
): Promise<boolean> {
  try {
    const libraries = await fetchLibraries(baseUrl, accessToken);

    // Find the library with the given ID
    const library = libraries.find((lib) => lib.id === libraryId);
    if (!library) {
      throw new Error(`Library with ID ${libraryId} not found`);
    }

    // Find the path within the library
    const path = library.paths.find((p) => p.id === pathId);
    if (!path) {
      throw new Error(
        `Path with ID ${pathId} not found in library '${library.name}' (ID: ${libraryId})`,
      );
    }

    logger.info(
      `[Booklore Client] Validated library '${library.name}' (ID: ${libraryId}) and path '${path.path}' (ID: ${pathId})`,
    );
    return true;
  } catch (error) {
    logger.error(
      `[Booklore Client] Validation failed for library ${libraryId} and path ${pathId}:`,
      error,
    );
    throw error;
  }
}
