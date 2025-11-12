import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@ephemera/shared";
import type {
  SavedRequestWithBook,
  RequestQueryParams,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

// Fetch requests with optional status filter
export const useRequests = (status?: "active" | "fulfilled" | "cancelled") => {
  return useQuery({
    queryKey: ["requests", status],
    queryFn: async () => {
      const url = status ? `/requests?status=${status}` : "/requests";
      return apiFetch<SavedRequestWithBook[]>(url);
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

// Fetch request stats
export const useRequestStats = () => {
  return useQuery({
    queryKey: ["request-stats"],
    queryFn: () =>
      apiFetch<{
        active: number;
        fulfilled: number;
        cancelled: number;
        total: number;
      }>("/requests/stats"),
    refetchInterval: 30000,
  });
};

// Create a new request
export const useCreateRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (queryParams: RequestQueryParams) => {
      return apiFetch("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryParams),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["request-stats"] });
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return apiFetch(`/requests/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["request-stats"] });
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
