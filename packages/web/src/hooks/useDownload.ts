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

export const useClearQueue = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{
      deletedCount: number;
      message: string;
    }> => {
      return apiFetch("/queue", {
        method: "DELETE",
      }) as Promise<{ deletedCount: number; message: string }>;
    },
    onSuccess: (data) => {
      notifications.show({
        title: "Queue Cleared",
        message: data.message,
        color: "green",
      });
      // Invalidate queue to trigger refetch (backup in case SSE is delayed)
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (error: Error) => {
      notifications.show({
        title: "Clear Queue Failed",
        message: error.message || "Failed to clear queue",
        color: "red",
      });
    },
  });
};

interface DownloadFileParams {
  md5: string;
  title: string;
  format?: string;
  authors?: string[];
  year?: number;
  language?: string;
}

export const useDownloadFile = () => {
  return useMutation({
    mutationFn: async ({
      md5,
      title,
      format,
      authors,
      year,
      language,
    }: DownloadFileParams) => {
      // Get the base URL from the current location
      const baseUrl = globalThis.window.location.origin;
      const downloadUrl = `${baseUrl}/api/download/${md5}/file`;

      // Fetch the file first to check for errors
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        // Try to parse error JSON from response
        try {
          const errorData = await response.json();
          throw new Error(
            errorData.details || errorData.error || "Download failed",
          );
        } catch {
          throw new Error(`Download failed with status ${response.status}`);
        }
      }

      // Generate filename with author, year, and language
      const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
      const parts = [safeTitle];

      // Add first author if available
      if (authors && authors.length > 0 && authors[0]) {
        const firstAuthor = authors[0].replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
        if (firstAuthor) parts.push(firstAuthor);
      }

      // Add year if available
      if (year) {
        parts.push(year.toString());
      }

      // Add language if available
      if (language) {
        parts.push(language.toUpperCase());
      }

      const extension = (format || "pdf").toLowerCase();
      const filename = `${parts.join(" - ")}.${extension}`;

      // Create blob URL from response
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Create a temporary anchor element to trigger download
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;

      // Trigger the download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);

      return { success: true };
    },
    onSuccess: (_, { title }) => {
      notifications.show({
        title: "Download Started",
        message: `Downloading "${title}"`,
        color: "blue",
      });
    },
    onError: (error: Error, { title }) => {
      notifications.show({
        title: "Download Failed",
        message: error.message || `Failed to download "${title}"`,
        color: "red",
      });
    },
  });
};
