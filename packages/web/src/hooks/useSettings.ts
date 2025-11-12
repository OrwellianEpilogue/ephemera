import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@ephemera/shared";
import type {
  AppSettings,
  UpdateAppSettings,
  BookloreSettingsResponse,
  UpdateBookloreSettings,
  BookloreTestResponse,
  AppriseSettings,
  UpdateAppriseSettings,
  AppriseTestResponse,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

// Fetch app settings
export const useAppSettings = () => {
  return useQuery({
    queryKey: ["appSettings"],
    queryFn: () => apiFetch<AppSettings>("/settings"),
  });
};

// Update app settings
export const useUpdateAppSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: UpdateAppSettings) => {
      return apiFetch<AppSettings>("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appSettings"] });
      notifications.show({
        title: "Settings Updated",
        message: "App settings have been saved successfully",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Update Failed",
        message: getErrorMessage(error) || "Failed to update app settings",
        color: "red",
      });
    },
  });
};

// Fetch Booklore settings
export const useBookloreSettings = () => {
  return useQuery({
    queryKey: ["bookloreSettings"],
    queryFn: () =>
      apiFetch<BookloreSettingsResponse | null>("/booklore/settings"),
  });
};

// Update Booklore settings
export const useUpdateBookloreSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: UpdateBookloreSettings) => {
      return apiFetch<BookloreSettingsResponse>("/booklore/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookloreSettings"] });
      notifications.show({
        title: "Booklore Settings Updated",
        message: "Booklore configuration has been saved successfully",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      console.error("[Booklore Settings] Update error:", error);

      notifications.show({
        title: "Update Failed",
        message: getErrorMessage(error) || "Failed to update Booklore settings",
        color: "red",
      });
    },
  });
};

// Test Booklore connection
export const useTestBookloreConnection = () => {
  return useMutation({
    mutationFn: async () => {
      return apiFetch<BookloreTestResponse>("/booklore/test", {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Connection Successful",
          message: data.message,
          color: "green",
        });
      } else {
        notifications.show({
          title: "Connection Failed",
          message: data.message,
          color: "red",
        });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Connection Test Failed",
        message: getErrorMessage(error) || "Failed to test connection",
        color: "red",
      });
    },
  });
};

// Fetch Apprise settings
export const useAppriseSettings = () => {
  return useQuery({
    queryKey: ["appriseSettings"],
    queryFn: () => apiFetch<AppriseSettings>("/apprise/settings"),
  });
};

// Update Apprise settings
export const useUpdateAppriseSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: UpdateAppriseSettings) => {
      return apiFetch<AppriseSettings>("/apprise/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appriseSettings"] });
      notifications.show({
        title: "Apprise Settings Updated",
        message: "Notification configuration has been saved successfully",
        color: "green",
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Update Failed",
        message: getErrorMessage(error) || "Failed to update Apprise settings",
        color: "red",
      });
    },
  });
};

// Test Apprise notification
export const useTestAppriseNotification = () => {
  return useMutation({
    mutationFn: async () => {
      return apiFetch<AppriseTestResponse>("/apprise/test", {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        notifications.show({
          title: "Test Notification Sent",
          message: data.message,
          color: "green",
        });
      } else {
        notifications.show({
          title: "Test Failed",
          message: data.message,
          color: "red",
        });
      }
    },
    onError: (error: unknown) => {
      notifications.show({
        title: "Test Failed",
        message: getErrorMessage(error) || "Failed to send test notification",
        color: "red",
      });
    },
  });
};
