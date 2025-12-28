import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";
import type { FrontendConfig } from "@ephemera/shared";

/**
 * Hook to fetch frontend configuration.
 * Returns safe config values needed by the frontend for all authenticated users.
 * This aggregates data from multiple settings sources without exposing sensitive data.
 */
export const useFrontendConfig = () => {
  return useQuery({
    queryKey: ["frontendConfig"],
    queryFn: () => apiFetch<FrontendConfig>("/config"),
    staleTime: 5 * 60 * 1000, // 5 minutes - config rarely changes
  });
};
