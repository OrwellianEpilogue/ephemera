import { GoodreadsFetcher } from "./goodreads.js";
import { StoryGraphFetcher } from "./storygraph.js";
import { HardcoverFetcher } from "./hardcover.js";
import { OpenLibraryFetcher } from "./openlibrary.js";
import { BabelioFetcher } from "./babelio.js";
import type { ListFetcher, ListSource } from "./types.js";
import { LIST_SOURCES } from "@ephemera/shared";

// Export types
export * from "./types.js";

// Create singleton instances
const goodreadsFetcher = new GoodreadsFetcher();
const storyGraphFetcher = new StoryGraphFetcher();
const hardcoverFetcher = new HardcoverFetcher();
const openLibraryFetcher = new OpenLibraryFetcher();
const babelioFetcher = new BabelioFetcher();

/**
 * Registry of all list fetchers
 */
export const listFetchers: Record<ListSource, ListFetcher> = {
  goodreads: goodreadsFetcher,
  storygraph: storyGraphFetcher,
  hardcover: hardcoverFetcher,
  openlibrary: openLibraryFetcher,
  babelio: babelioFetcher,
};

/**
 * Get a fetcher by source name
 */
export function getFetcher(source: ListSource): ListFetcher {
  return listFetchers[source];
}

/**
 * Get the Hardcover fetcher instance (to set API token)
 */
export function getHardcoverFetcher(): HardcoverFetcher {
  return hardcoverFetcher;
}

/**
 * Available sources with metadata (re-exported from shared)
 */
export const listSources = LIST_SOURCES;
