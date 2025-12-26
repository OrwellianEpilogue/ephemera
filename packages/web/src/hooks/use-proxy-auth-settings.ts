import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";
import type {
  ProxyAuthSettings,
  UpdateProxyAuthSettings,
} from "@ephemera/shared";
import { notifications } from "@mantine/notifications";

export function useProxyAuthSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["proxy-auth-settings"],
    queryFn: () => apiFetch<ProxyAuthSettings>("/settings/proxy-auth"),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateProxyAuthSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProxyAuthSettings) =>
      apiFetch<ProxyAuthSettings>("/settings/proxy-auth", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxy-auth-settings"] });
      notifications.show({
        title: "Settings saved",
        message: "Proxy authentication settings updated successfully",
        color: "green",
      });
    },
    onError: (error: Error) => {
      notifications.show({
        title: "Failed to save settings",
        message: error.message || "An error occurred",
        color: "red",
      });
    },
  });
}
