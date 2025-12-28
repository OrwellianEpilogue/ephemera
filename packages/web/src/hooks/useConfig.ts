import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";
import type { FrontendConfig } from "@ephemera/shared";

/**
 * Hook to fetch frontend configuration.
 * Returns safe config values needed by the frontend for all authenticated users.
 * This aggregates data from multiple settings sources without exposing sensitive data.
 *
 * Includes adaptive polling for maintenance mode detection:
 * - Normal: poll every 60 seconds
 * - During maintenance: poll every 5 seconds for faster recovery detection
 */
export const useFrontendConfig = () => {
  return useQuery({
    queryKey: ["frontendConfig"],
    queryFn: () => apiFetch<FrontendConfig>("/config"),
    staleTime: 15 * 1000, // 15 seconds - faster detection of maintenance mode
    refetchInterval: (query) => {
      // Poll more frequently during maintenance mode for faster recovery detection
      const data = query.state.data;
      return data?.maintenanceMode ? 5000 : 60000; // 5s in maintenance, 60s normal
    },
  });
};
