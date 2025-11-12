import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

interface QueueDownloadParams {
  md5: string;
  title: string;
}

export const useQueueDownload = () => {
  return useMutation({
    mutationFn: async (params: QueueDownloadParams) => {
      // Only send MD5 - book data already exists in database from search
      return apiFetch(`/download/${params.md5}`, {
        method: "POST",
      });
    },
    onSuccess: (_, { title }) => {
      notifications.show({
        title: "Download Queued",
        message: `"${title}" has been added to the download queue`,
        color: "green",
      });
      // No need to invalidate - SSE will push the update automatically
    },
    onError: (error: Error, { title }) => {
      notifications.show({
        title: "Download Failed",
        message: error.message || `Failed to queue "${title}"`,
        color: "red",
      });
    },
  });
};

interface CancelDownloadParams {
  md5: string;
  title: string;
}

export const useCancelDownload = () => {
  return useMutation({
    mutationFn: async ({ md5 }: CancelDownloadParams) => {
      return apiFetch(`/download/${md5}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, { title }) => {
      notifications.show({
        title: "Download Cancelled",
        message: `"${title}" has been cancelled`,
        color: "orange",
      });
      // No need to invalidate - SSE will push the update automatically
    },
    onError: (error: Error, { title }) => {
      notifications.show({
        title: "Cancel Failed",
        message: error.message || `Failed to cancel "${title}"`,
        color: "red",
      });
    },
  });
};

interface RetryDownloadParams {
  md5: string;
  title: string;
}

export const useRetryDownload = () => {
  return useMutation({
    mutationFn: async ({ md5 }: RetryDownloadParams) => {
      return apiFetch(`/download/${md5}/retry`, {
        method: "POST",
      });
    },
    onSuccess: (_, { title }) => {
      notifications.show({
        title: "Download Retrying",
        message: `"${title}" has been added back to the queue`,
        color: "blue",
      });
      // No need to invalidate - SSE will push the update automatically
    },
    onError: (error: Error, { title }) => {
      notifications.show({
        title: "Retry Failed",
        message: error.message || `Failed to retry "${title}"`,
        color: "red",
      });
    },
  });
};

interface DeleteDownloadParams {
  md5: string;
  title: string;
}

export const useDeleteDownload = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ md5 }: DeleteDownloadParams) => {
      return apiFetch(`/download/${md5}/permanent`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, { title }) => {
      notifications.show({
        title: "Download Deleted",
        message: `"${title}" has been removed from the queue`,
        color: "green",
      });
      // Invalidate queue to trigger refetch (backup in case SSE is delayed)
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (error: Error, { title }) => {
      notifications.show({
        title: "Delete Failed",
        message: error.message || `Failed to delete "${title}"`,
        color: "red",
      });
    },
  });
};
