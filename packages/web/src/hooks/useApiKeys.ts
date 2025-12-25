import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";

/**
 * API Key type matching backend response
 */
export interface ApiKey {
  id: string;
  name: string | null;
  start: string | null; // First few chars for display
  userId: string;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Newly created API key (includes full key - only shown once!)
 */
export interface NewApiKey {
  id: string;
  key: string; // Full key - save it now!
  name: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Hook for fetching user's API keys
 */
export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch<ApiKey[]>("/api-keys"),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for creating a new API key
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation<NewApiKey, Error, { name: string; expiresIn?: number }>({
    mutationFn: async ({ name, expiresIn }) => {
      return apiFetch<NewApiKey>("/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresIn }),
      });
    },
    onSuccess: () => {
      // Invalidate the API keys list to refresh
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

/**
 * Hook for deleting an API key
 */
export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (keyId) => {
      await apiFetch(`/api-keys/${keyId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      // Invalidate the API keys list to refresh
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
