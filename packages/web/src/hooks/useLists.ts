import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";

// ========== Types ==========

export type ListSource =
  | "goodreads"
  | "storygraph"
  | "hardcover"
  | "openlibrary"
  | "babelio";
export type ListImportMode = "all" | "future";
export type ListFetchInterval = "15min" | "30min" | "1h" | "6h" | "12h" | "24h";

export interface ImportList {
  id: number;
  userId: string;
  userName?: string;
  userEmail?: string;
  source: ListSource;
  name: string;
  sourceConfig: Record<string, unknown>;
  searchDefaults: {
    lang?: string[];
    ext?: string[];
    content?: string[];
    sort?: string;
  } | null;
  importMode: ListImportMode;
  useBookLanguage: boolean;
  enabled: boolean;
  lastFetchedAt: number | null;
  fetchError: string | null;
  totalBooksImported: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateListInput {
  source: ListSource;
  name: string;
  sourceConfig: Record<string, unknown>;
  searchDefaults?: {
    lang?: string[];
    ext?: string[];
    content?: string[];
    sort?: string;
  };
  importMode?: ListImportMode;
  useBookLanguage?: boolean;
}

export interface UpdateListInput {
  name?: string;
  sourceConfig?: Record<string, unknown>;
  searchDefaults?: {
    lang?: string[];
    ext?: string[];
    content?: string[];
    sort?: string;
  };
  enabled?: boolean;
}

export interface ListSourceInfo {
  id: ListSource;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresFlareSolverr: boolean;
}

export interface AvailableList {
  id: string;
  name: string;
  slug?: string;
}

export interface ProcessResult {
  newBooks: number;
  totalBooks: number;
  error?: string;
}

export interface ListSettings {
  listFetchInterval: ListFetchInterval;
  hardcoverApiToken: string | null;
  searchByIsbnFirst: boolean;
  includeYearInSearch: boolean;
  embedMetadataInBooks: boolean;
  updatedAt: number;
}

export interface ListStats {
  totalLists: number;
  enabledLists: number;
  totalBooksImported: number;
  listsBySource: Record<string, number>;
  isCheckerRunning: boolean;
}

// ========== User Hooks ==========

/**
 * Hook for fetching user's import lists
 */
export function useLists() {
  return useQuery<ImportList[]>({
    queryKey: ["lists"],
    queryFn: () => apiFetch<ImportList[]>("/lists"),
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Hook for fetching a single list
 */
export function useList(id: number) {
  return useQuery<ImportList>({
    queryKey: ["lists", id],
    queryFn: () => apiFetch<ImportList>(`/lists/${id}`),
    enabled: !!id,
  });
}

/**
 * Hook for creating a new list
 */
export function useCreateList() {
  const queryClient = useQueryClient();

  return useMutation<ImportList, Error, CreateListInput>({
    mutationFn: async (data) => {
      return apiFetch<ImportList>("/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

/**
 * Hook for updating a list
 */
export function useUpdateList() {
  const queryClient = useQueryClient();

  return useMutation<ImportList, Error, { id: number; data: UpdateListInput }>({
    mutationFn: async ({ id, data }) => {
      return apiFetch<ImportList>(`/lists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["lists", id] });
    },
  });
}

/**
 * Hook for deleting a list
 */
export function useDeleteList() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await apiFetch(`/lists/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

/**
 * Hook for manually refreshing a list
 */
export function useRefreshList() {
  const queryClient = useQueryClient();

  return useMutation<ProcessResult, Error, number>({
    mutationFn: async (id) => {
      return apiFetch<ProcessResult>(`/lists/${id}/refresh`, {
        method: "POST",
      });
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["lists", id] });
    },
  });
}

/**
 * Hook for fetching available list sources
 */
export function useListSources() {
  return useQuery<ListSourceInfo[]>({
    queryKey: ["list-sources"],
    queryFn: () => apiFetch<ListSourceInfo[]>("/lists/sources"),
    staleTime: 1000 * 60 * 30, // 30 minutes - sources don't change often
  });
}

/**
 * Hook for validating a source configuration
 */
export function useValidateConfig() {
  return useMutation<
    { valid: boolean; error?: string },
    Error,
    { source: ListSource; config: Record<string, unknown> }
  >({
    mutationFn: async ({ source, config }) => {
      return apiFetch<{ valid: boolean; error?: string }>("/lists/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, config }),
      });
    },
  });
}

/**
 * Hook for parsing a profile URL
 */
export function useParseUrl() {
  return useMutation<
    { userId: string | null },
    Error,
    { source: ListSource; url: string }
  >({
    mutationFn: async ({ source, url }) => {
      return apiFetch<{ userId: string | null }>("/lists/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, url }),
      });
    },
  });
}

/**
 * Hook for fetching Goodreads shelves for a user
 */
export function useGoodreadsShelves(userId: string | undefined) {
  return useQuery<AvailableList[]>({
    queryKey: ["goodreads-shelves", userId],
    queryFn: () =>
      apiFetch<AvailableList[]>(`/lists/goodreads/shelves?userId=${userId}`),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for fetching Hardcover lists for a user
 */
export function useHardcoverLists(username: string | undefined) {
  return useQuery<AvailableList[]>({
    queryKey: ["hardcover-lists", username],
    queryFn: () =>
      apiFetch<AvailableList[]>(`/lists/hardcover/lists?username=${username}`),
    enabled: !!username,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for fetching OpenLibrary lists for a user
 */
export function useOpenLibraryLists(username: string | undefined) {
  return useQuery<AvailableList[]>({
    queryKey: ["openlibrary-lists", username],
    queryFn: () =>
      apiFetch<AvailableList[]>(
        `/lists/openlibrary/lists?username=${username}`,
      ),
    enabled: !!username,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ========== Admin Hooks ==========

/**
 * Hook for fetching all lists (admin only)
 */
export function useAllLists() {
  return useQuery<ImportList[]>({
    queryKey: ["admin-lists"],
    queryFn: () => apiFetch<ImportList[]>("/admin/lists"),
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Hook for fetching list settings (admin only)
 */
export function useListSettings() {
  return useQuery<ListSettings>({
    queryKey: ["list-settings"],
    queryFn: () => apiFetch<ListSettings>("/admin/lists/settings"),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for updating list settings (admin only)
 */
export function useUpdateListSettings() {
  const queryClient = useQueryClient();

  return useMutation<
    ListSettings,
    Error,
    {
      listFetchInterval?: ListFetchInterval;
      hardcoverApiToken?: string | null;
      searchByIsbnFirst?: boolean;
      includeYearInSearch?: boolean;
      embedMetadataInBooks?: boolean;
    }
  >({
    mutationFn: async (data) => {
      return apiFetch<ListSettings>("/admin/lists/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-settings"] });
      queryClient.invalidateQueries({ queryKey: ["list-sources"] }); // API key status may change
    },
  });
}

/**
 * Hook for fetching list statistics (admin only)
 */
export function useListStats() {
  return useQuery<ListStats>({
    queryKey: ["list-stats"],
    queryFn: () => apiFetch<ListStats>("/admin/lists/stats"),
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Hook for triggering immediate check of all lists (admin only)
 */
export function useCheckNow() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error>({
    mutationFn: async () => {
      return apiFetch<{ message: string }>("/admin/lists/check-now", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list-stats"] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["admin-lists"] });
    },
  });
}
