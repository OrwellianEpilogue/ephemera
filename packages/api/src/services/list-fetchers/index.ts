import { GoodreadsFetcher } from "./goodreads.js";
import { StoryGraphFetcher } from "./storygraph.js";
import { HardcoverFetcher } from "./hardcover.js";
import type { ListFetcher, ListSource } from "./types.js";

// Export types
export * from "./types.js";

// Create singleton instances
const goodreadsFetcher = new GoodreadsFetcher();
const storyGraphFetcher = new StoryGraphFetcher();
const hardcoverFetcher = new HardcoverFetcher();

/**
 * Registry of all list fetchers
 */
export const listFetchers: Record<ListSource, ListFetcher> = {
  goodreads: goodreadsFetcher,
  storygraph: storyGraphFetcher,
  hardcover: hardcoverFetcher,
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
 * Available sources with metadata
 */
export const listSources: Array<{
  id: ListSource;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresFlareSolverr: boolean;
}> = [
  {
    id: "goodreads",
    name: "Goodreads",
    description: "Import from Goodreads shelves via RSS",
    requiresApiKey: false,
    requiresFlareSolverr: false,
  },
  {
    id: "storygraph",
    name: "StoryGraph",
    description: "Import from StoryGraph to-read list",
    requiresApiKey: false,
    requiresFlareSolverr: true,
  },
  {
    id: "hardcover",
    name: "Hardcover",
    description: "Import from Hardcover lists via API",
    requiresApiKey: true,
    requiresFlareSolverr: false,
  },
];
