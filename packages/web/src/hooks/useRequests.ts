import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect, useState, useMemo } from "react";
import { apiFetch, getErrorMessage } from "@ephemera/shared";
import type {
  SavedRequestWithMetadata,
  RequestStats,
  CreateRequestInput,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

interface UseRequestsOptions {
  enableSSE?: boolean; // Control whether to establish SSE connection (only enable at root level)
}

interface RequestsUpdate {
  requests: SavedRequestWithMetadata[];
  stats: RequestStats;
}

// Fetch requests with optional status filter and SSE support
export const useRequests = (
  status?:
    | "pending_approval"
    | "active"
    | "fulfilled"
    | "cancelled"
    | "rejected",
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
      return apiFetch<SavedRequestWithMetadata[]>(url);
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
        const pendingRequests = data.requests.filter(
          (r) => r.status === "pending_approval",
        );
        const activeRequests = data.requests.filter(
          (r) => r.status === "active",
        );
        const fulfilledRequests = data.requests.filter(
          (r) => r.status === "fulfilled",
        );
        const cancelledRequests = data.requests.filter(
          (r) => r.status === "cancelled",
        );
        const rejectedRequests = data.requests.filter(
          (r) => r.status === "rejected",
        );

        queryClient.setQueryData(
          ["requests", "pending_approval"],
          pendingRequests,
        );
        queryClient.setQueryData(["requests", "active"], activeRequests);
        queryClient.setQueryData(["requests", "fulfilled"], fulfilledRequests);
        queryClient.setQueryData(["requests", "cancelled"], cancelledRequests);
        queryClient.setQueryData(["requests", "rejected"], rejectedRequests);

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

// Create a new request (with optional targetBookMd5 for direct downloads)
export const useCreateRequest = () => {
  return useMutation({
    mutationFn: async (input: CreateRequestInput) => {
      return apiFetch<SavedRequestWithMetadata>("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },
    onSuccess: (data) => {
      // No need to invalidate queries - SSE will update automatically
      const needsApproval = data.status === "pending_approval";
      notifications.show({
        title: "Request saved!",
        message: needsApproval
          ? "Your request has been submitted and will be reviewed by an administrator"
          : "Ephemera will automatically search for this book and download it when available",
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

// Approve a pending request
export const useApproveRequest = () => {
  return useMutation({
    mutationFn: async (id: number) => {
      return apiFetch(`/requests/${id}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      // No need to invalidate queries - SSE will update automatically
      notifications.show({
        title: "Request approved",
        message: "The request has been approved and will be processed",
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to approve request",
        color: "red",
      });
    },
  });
};

// Reject a pending request
export const useRejectRequest = () => {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      return apiFetch(`/requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      // No need to invalidate queries - SSE will update automatically
      notifications.show({
        title: "Request rejected",
        message: "The request has been rejected",
        color: "orange",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to reject request",
        color: "red",
      });
    },
  });
};

// Manually fulfill a request with a specific book
export const useFulfillRequest = () => {
  return useMutation({
    mutationFn: async ({ id, bookMd5 }: { id: number; bookMd5: string }) => {
      return apiFetch(`/requests/${id}/fulfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookMd5 }),
      });
    },
    onSuccess: () => {
      // No need to invalidate queries - SSE will update automatically
      notifications.show({
        title: "Request fulfilled",
        message: "The book has been queued for download",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      const errorMessage = getErrorMessage(error);
      notifications.show({
        title: "Error",
        message: errorMessage || "Failed to fulfill request",
        color: "red",
      });
    },
  });
};

/**
 * Hook to get a set of MD5 hashes that have pending or active requests
 * Used to show "Already Requested" state on book cards
 */
export const usePendingRequestMd5s = (): Set<string> => {
  // Just read from the requests query - no need for separate subscription
  const { data: allRequests } = useRequests(undefined, { enableSSE: false });

  // Memoize the Set to avoid recreating on every render
  const md5Set = useMemo(() => {
    const pendingMd5s = new Set<string>();
    if (allRequests) {
      for (const request of allRequests) {
        if (
          (request.status === "pending_approval" ||
            request.status === "active") &&
          request.targetBookMd5
        ) {
          pendingMd5s.add(request.targetBookMd5);
        }
      }
    }
    return pendingMd5s;
  }, [allRequests]);

  return md5Set;
};
