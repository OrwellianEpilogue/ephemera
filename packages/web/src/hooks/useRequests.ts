import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { apiFetch, getErrorMessage } from "@ephemera/shared";
import type {
  SavedRequestWithBook,
  RequestQueryParams,
  RequestStats,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

interface UseRequestsOptions {
  enableSSE?: boolean; // Control whether to establish SSE connection (only enable at root level)
}

interface RequestsUpdate {
  requests: SavedRequestWithBook[];
  stats: RequestStats;
}

// Fetch requests with optional status filter and SSE support
export const useRequests = (
  status?: "active" | "fulfilled" | "cancelled",
  options: UseRequestsOptions = {},
) => {
  const { enableSSE = false } = options;
  const queryClient = useQueryClient();
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const [sseError, setSSEError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial fetch via REST and fallback polling if SSE fails
  const query = useQuery({
    queryKey: ["requests", status],
    queryFn: async () => {
      const url = status ? `/requests?status=${status}` : "/requests";
      return apiFetch<SavedRequestWithBook[]>(url);
    },
    // Only poll if SSE is enabled but not yet connected (fallback)
    // If SSE is disabled, don't poll (rely on cache from root component)
    refetchInterval: enableSSE && !isSSEConnected ? 5000 : false,
  });

  // Establish SSE connection for real-time updates (ONLY if enableSSE is true)
  useEffect(() => {
    // Skip if SSE is not enabled for this hook instance
    if (!enableSSE) return;

    // Don't try SSE if it already errored
    if (sseError) return;

    const eventSource = new EventSource("/api/requests/stream");
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("requests-updated", (event) => {
      try {
        const data: RequestsUpdate = JSON.parse(event.data);

        // Update all requests queries in React Query cache
        queryClient.setQueryData(["requests", undefined], data.requests);

        // Also update filtered queries
        const activeRequests = data.requests.filter(
          (r) => r.status === "active",
        );
        const fulfilledRequests = data.requests.filter(
          (r) => r.status === "fulfilled",
        );
        const cancelledRequests = data.requests.filter(
          (r) => r.status === "cancelled",
        );

        queryClient.setQueryData(["requests", "active"], activeRequests);
        queryClient.setQueryData(["requests", "fulfilled"], fulfilledRequests);
        queryClient.setQueryData(["requests", "cancelled"], cancelledRequests);

        // Update stats cache
        queryClient.setQueryData(["request-stats"], data.stats);
      } catch (error) {
        console.error("[SSE] Failed to parse requests update:", error);
      }
    });

    eventSource.addEventListener("ping", () => {
      // Heartbeat received, connection is alive
    });

    eventSource.onopen = () => {
      console.log("[SSE] Connected to requests updates");
      setIsSSEConnected(true);
      setSSEError(false);
    };

    eventSource.onerror = (error) => {
      console.error("[SSE] Connection error, falling back to polling:", error);
      setIsSSEConnected(false);
      setSSEError(true);
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsSSEConnected(false);
    };
  }, [queryClient, sseError, enableSSE]);

  return {
    ...query,
    isSSEConnected,
    isPolling: !isSSEConnected,
  };
};

// Fetch request stats (shares SSE connection with useRequests)
export const useRequestStats = () => {
  return useQuery({
    queryKey: ["request-stats"],
    queryFn: () => apiFetch<RequestStats>("/requests/stats"),
    // Don't poll - rely on SSE updates from root component
    refetchInterval: false,
  });
};

// Create a new request
export const useCreateRequest = () => {
  return useMutation({
    mutationFn: async (queryParams: RequestQueryParams) => {
      return apiFetch("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryParams),
      });
    },
    onSuccess: () => {
      // No need to invalidate queries - SSE will update automatically
      notifications.show({
        title: "Request saved!",
        message:
          "Ephemera will automatically search for this book and download it when available",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      const errorMessage = getErrorMessage(error);
      const isDuplicate =
        errorMessage.includes("409") ||
        errorMessage.toLowerCase().includes("duplicate");
      const message = isDuplicate
        ? "You already have an active request for this search"
        : "Failed to save request. Please try again.";

      notifications.show({
        title: "Error",
        message,
        color: "red",
      });
    },
  });
};

// Delete a request
export const useDeleteRequest = () => {
  return useMutation({
    mutationFn: async (id: number) => {
      return apiFetch(`/requests/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      // No need to invalidate queries - SSE will update automatically
      notifications.show({
        title: "Request deleted",
        message: "The request has been removed",
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to delete request",
        color: "red",
      });
    },
  });
};
