import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";
import type { VersionInfo } from "@ephemera/shared";

const ONE_HOUR_MS = 60 * 60 * 1000;

// Fetch version info
export const useVersion = () => {
  return useQuery({
    queryKey: ["version"],
    queryFn: () => apiFetch<VersionInfo>("/version"),
    staleTime: ONE_HOUR_MS, // Cache for 1 hour
    gcTime: ONE_HOUR_MS, // Keep in cache for 1 hour (formerly cacheTime)
    refetchInterval: ONE_HOUR_MS, // Refetch every hour while app is open
    refetchOnWindowFocus: false, // Don't refetch on window focus
    retry: 1, // Only retry once on error
  });
};
