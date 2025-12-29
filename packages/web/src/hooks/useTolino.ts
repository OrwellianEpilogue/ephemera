import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@ephemera/shared";
import type {
  TolinoResellerInfo,
  TolinoSettingsResponse,
  TolinoSettingsInput,
  TolinoUploadRequest,
  TolinoUploadResponse,
  TolinoTestResponse,
  TolinoCanUploadResponse,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

// Query keys
export const tolinoKeys = {
  settings: ["tolinoSettings"] as const,
  resellers: ["tolinoResellers"] as const,
  collections: ["tolinoCollections"] as const,
  canUpload: (md5: string) => ["tolinoCanUpload", md5] as const,
  suggestedCollection: (md5: string) =>
    ["tolinoSuggestedCollection", md5] as const,
};

// Response types from API
interface TolinoSettingsApiResponse {
  configured: boolean;
  resellerId?: string;
  email?: string;
  autoUpload?: boolean;
  askCollectionOnUpload?: boolean;
  autoUploadCollection?: string | null;
  useSeriesAsCollection?: boolean;
  isConnected?: boolean;
  tokenExpiresAt?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

interface TolinoCollectionsResponse {
  collections: string[];
}

interface SaveSettingsResponse {
  success: boolean;
  settings: TolinoSettingsResponse;
}

/**
 * Get Tolino settings for current user
 */
export const useTolinoSettings = () => {
  return useQuery({
    queryKey: tolinoKeys.settings,
    queryFn: () => apiFetch<TolinoSettingsApiResponse>("/tolino/settings"),
    staleTime: 60 * 1000, // 1 minute
  });
};

/**
 * Get available Tolino resellers
 * This is static data so cache for a long time
 */
export const useTolinoResellers = () => {
  return useQuery({
    queryKey: tolinoKeys.resellers,
    queryFn: () => apiFetch<TolinoResellerInfo[]>("/tolino/resellers"),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
  });
};

/**
 * Get collections from Tolino Cloud
 */
export const useTolinoCollections = (enabled = true) => {
  return useQuery({
    queryKey: tolinoKeys.collections,
    queryFn: () => apiFetch<TolinoCollectionsResponse>("/tolino/collections"),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    retry: false, // Don't retry if unauthorized
  });
};

/**
 * Check if a book can be uploaded to Tolino
 */
export const useTolinoCanUpload = (md5: string, enabled = true) => {
  return useQuery({
    queryKey: tolinoKeys.canUpload(md5),
    queryFn: () =>
      apiFetch<TolinoCanUploadResponse>(`/tolino/can-upload/${md5}`),
    enabled: enabled && !!md5,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

interface TolinoSuggestedCollectionResponse {
  suggestedCollection: string | null;
}

/**
 * Get suggested collection (series name) for a book
 */
export const useTolinoSuggestedCollection = (md5: string, enabled = true) => {
  return useQuery({
    queryKey: tolinoKeys.suggestedCollection(md5),
    queryFn: () =>
      apiFetch<TolinoSuggestedCollectionResponse>(
        `/tolino/suggested-collection/${md5}`,
      ),
    enabled: enabled && !!md5,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Save or update Tolino settings
 */
export const useSaveTolinoSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: TolinoSettingsInput) => {
      return apiFetch<SaveSettingsResponse>("/tolino/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Tolino Settings Saved",
          message: "Your Tolino Cloud settings have been saved",
          color: "green",
        });
        queryClient.invalidateQueries({ queryKey: tolinoKeys.settings });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Failed to Save Settings",
        message: getErrorMessage(error) || "Failed to save Tolino settings",
        color: "red",
      });
    },
  });
};

/**
 * Update auto-upload setting only
 */
export const useUpdateTolinoAutoUpload = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (autoUpload: boolean) => {
      return apiFetch<{ success: boolean; autoUpload: boolean }>(
        "/tolino/settings/auto-upload",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoUpload }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tolinoKeys.settings });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Failed to Update",
        message:
          getErrorMessage(error) || "Failed to update auto-upload setting",
        color: "red",
      });
    },
  });
};

/**
 * Update collection settings only
 */
export const useUpdateTolinoCollectionSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: {
      askCollectionOnUpload: boolean;
      autoUploadCollection: string | null;
      useSeriesAsCollection?: boolean;
    }) => {
      return apiFetch<{
        success: boolean;
        askCollectionOnUpload: boolean;
        autoUploadCollection: string | null;
        useSeriesAsCollection?: boolean;
      }>("/tolino/settings/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tolinoKeys.settings });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Failed to Update",
        message:
          getErrorMessage(error) || "Failed to update collection settings",
        color: "red",
      });
    },
  });
};

/**
 * Delete Tolino settings
 */
export const useDeleteTolinoSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiFetch<{ success: boolean }>("/tolino/settings", {
        method: "DELETE",
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Tolino Disconnected",
          message: "Your Tolino Cloud settings have been removed",
          color: "blue",
        });
        queryClient.invalidateQueries({ queryKey: tolinoKeys.settings });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Failed to Delete Settings",
        message: getErrorMessage(error) || "Failed to remove Tolino settings",
        color: "red",
      });
    },
  });
};

/**
 * Test Tolino connection
 */
export const useTestTolinoConnection = () => {
  return useMutation({
    mutationFn: async () => {
      return apiFetch<TolinoTestResponse>("/tolino/test", {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Connection Successful",
          message: "Successfully connected to Tolino Cloud",
          color: "green",
        });
      } else {
        notifications.show({
          title: "Connection Failed",
          message: data.message || "Failed to connect to Tolino Cloud",
          color: "red",
        });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Connection Failed",
        message: getErrorMessage(error) || "Failed to test Tolino connection",
        color: "red",
      });
    },
  });
};

/**
 * Upload a book to Tolino Cloud
 */
export const useTolinoUpload = () => {
  return useMutation({
    mutationFn: async (request: TolinoUploadRequest) => {
      return apiFetch<TolinoUploadResponse>("/tolino/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Upload Complete",
          message: "Book has been uploaded to Tolino Cloud",
          color: "green",
        });
      } else {
        notifications.show({
          title: "Upload Failed",
          message: data.message || "Failed to upload book",
          color: "red",
        });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Upload Failed",
        message: getErrorMessage(error) || "Failed to upload to Tolino Cloud",
        color: "red",
      });
    },
  });
};
