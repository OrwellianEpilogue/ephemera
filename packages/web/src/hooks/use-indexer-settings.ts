import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiFetch,
  type IndexerSettings,
  type IndexerSettingsUpdate,
  type RegenerateApiKeyRequest,
  type RegenerateApiKeyResponse,
} from "@ephemera/shared";

/**
 * Hook to fetch indexer settings
 */
export function useIndexerSettings(options?: { enabled?: boolean }) {
  return useQuery<IndexerSettings>({
    queryKey: ["indexer-settings"],
    queryFn: () => apiFetch<IndexerSettings>("/indexer/settings"),
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: options?.enabled ?? true,
  });
}

/**
 * Hook to update indexer settings
 */
export function useUpdateIndexerSettings() {
  const queryClient = useQueryClient();

  return useMutation<IndexerSettings, Error, IndexerSettingsUpdate>({
    mutationFn: (updates) =>
      apiFetch<IndexerSettings>("/indexer/settings", {
        method: "PUT",
        body: JSON.stringify(updates),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["indexer-settings"], data);
    },
  });
}

/**
 * Hook to regenerate API key
 */
export function useRegenerateApiKey() {
  const queryClient = useQueryClient();

  return useMutation<RegenerateApiKeyResponse, Error, RegenerateApiKeyRequest>({
    mutationFn: ({ service }) =>
      apiFetch<RegenerateApiKeyResponse>("/indexer/regenerate-key", {
        method: "POST",
        body: JSON.stringify({ service }),
      }),
    onSuccess: () => {
      // Refetch settings to get the new API key
      queryClient.invalidateQueries({ queryKey: ["indexer-settings"] });
    },
  });
}
