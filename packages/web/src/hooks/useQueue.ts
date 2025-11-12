import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { apiFetch } from "@ephemera/shared";
import type { QueueResponse } from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

interface UseQueueOptions {
  notifyOnComplete?: boolean;
  enableSSE?: boolean; // Control whether to establish SSE connection (only enable at root level)
}

export const useQueue = (options: UseQueueOptions = {}) => {
  const { notifyOnComplete = false, enableSSE = false } = options;
  const queryClient = useQueryClient();
  const previousAvailableRef = useRef<Set<string>>(new Set());
  const previousDelayedRef = useRef<Set<string>>(new Set());
  const previousErrorRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const [sseError, setSSEError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial fetch via REST and fallback polling if SSE fails
  const query = useQuery({
    queryKey: ["queue"],
    queryFn: () => apiFetch<QueueResponse>("/queue"),
    // Only poll if SSE is not connected or has errored (and SSE is enabled)
    refetchInterval: enableSSE && isSSEConnected ? false : 5000,
  });

  // Establish SSE connection for real-time updates (ONLY if enableSSE is true)
  useEffect(() => {
    // Skip if SSE is not enabled for this hook instance
    if (!enableSSE) return;

    // Don't try SSE if it already errored
    if (sseError) return;

    const eventSource = new EventSource("/api/queue/stream");
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("queue-update", (event) => {
      try {
        const data: QueueResponse = JSON.parse(event.data);

        // Update React Query cache with new data
        queryClient.setQueryData(["queue"], data);
      } catch (error) {
        console.error("[SSE] Failed to parse queue update:", error);
      }
    });

    eventSource.addEventListener("ping", () => {
      // Heartbeat received, connection is alive
      // console.log('[SSE] Heartbeat received');
    });

    eventSource.onopen = () => {
      console.log("[SSE] Connected to queue updates");
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

  // Track status changes and show notifications
  useEffect(() => {
    if (!notifyOnComplete || !query.data) return;

    const currentAvailable = new Set(Object.keys(query.data.available || {}));
    const currentDelayed = new Set(Object.keys(query.data.delayed || {}));
    const currentError = new Set(Object.keys(query.data.error || {}));

    // Skip notifications on initial load - just initialize the refs
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      previousAvailableRef.current = currentAvailable;
      previousDelayedRef.current = currentDelayed;
      previousErrorRef.current = currentError;
      return;
    }

    // Find newly available items
    const newlyAvailable = [...currentAvailable].filter(
      (md5) => !previousAvailableRef.current.has(md5),
    );

    // Find newly delayed items
    const newlyDelayed = [...currentDelayed].filter(
      (md5) => !previousDelayedRef.current.has(md5),
    );

    // Find newly errored items
    const newlyErrored = [...currentError].filter(
      (md5) => !previousErrorRef.current.has(md5),
    );

    // Show notification for each newly available download
    newlyAvailable.forEach((md5) => {
      const item = query.data.available[md5];
      if (item) {
        notifications.show({
          title: "Download Complete",
          message: `"${item.title}" is now available`,
          color: "green",
          autoClose: 5000,
        });
      }
    });

    // Show notification for each newly delayed download
    newlyDelayed.forEach((md5) => {
      const item = query.data.delayed[md5];
      if (item) {
        const nextRetryDate = item.nextRetryAt
          ? new Date(item.nextRetryAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "soon";
        notifications.show({
          title: "Download Delayed",
          message: `"${item.title}" - Quota reached, will retry at ${nextRetryDate}`,
          color: "orange",
          autoClose: 7000,
        });
      }
    });

    // Show notification for each newly errored download
    newlyErrored.forEach((md5) => {
      const item = query.data.error[md5];
      if (item) {
        notifications.show({
          title: "Download Failed",
          message: `"${item.title}" - ${item.error || "Unknown error"}`,
          color: "red",
          autoClose: 10000,
        });
      }
    });

    // Update the refs for next comparison
    previousAvailableRef.current = currentAvailable;
    previousDelayedRef.current = currentDelayed;
    previousErrorRef.current = currentError;
  }, [query.data, notifyOnComplete]);

  return {
    ...query,
    isSSEConnected,
    isPolling: !isSSEConnected,
  };
};

export const useQueueItem = (md5: string) => {
  return useQuery({
    queryKey: ["queue", md5],
    queryFn: () => apiFetch(`/queue/${md5}`),
    refetchInterval: 1000, // Poll every second for individual item
  });
};
