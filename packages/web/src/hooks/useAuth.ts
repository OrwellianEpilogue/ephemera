import { useSession } from "../lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";

/**
 * Hook for accessing current user authentication state
 * Returns user, authentication status, and admin status
 */
export function useAuth() {
  const { data: session, isPending } = useSession();

  return {
    user: session?.user,
    isAuthenticated: !!session?.user,
    isAdmin: session?.user?.role === "admin",
    isPending,
    session,
  };
}

/**
 * User permissions interface matching backend structure
 */
export interface UserPermissions {
  canDeleteDownloads: boolean;
  canConfigureNotifications: boolean;
  canManageRequests: boolean;
  canStartDownloads: boolean;
  canConfigureApp: boolean;
  canConfigureIntegrations: boolean;
  canConfigureEmail: boolean;
  canSeeDownloadOwner: boolean;
  canManageApiKeys: boolean;
  canConfigureTolino: boolean;
}

/**
 * Hook for fetching user permissions from the API
 * Admins have all permissions by default
 */
export function usePermissions() {
  const { user, isAdmin, isAuthenticated } = useAuth();

  return useQuery<UserPermissions>({
    queryKey: ["permissions", user?.id],
    queryFn: async () => {
      try {
        const response = await apiFetch<UserPermissions>("/permissions", {
          method: "GET",
        });
        return response;
      } catch (error) {
        console.error("[usePermissions] Error fetching permissions:", error);
        // Return default permissions on error
        return {
          canDeleteDownloads: false,
          canConfigureNotifications: false,
          canManageRequests: false,
          canStartDownloads: true,
          canConfigureApp: false,
          canConfigureIntegrations: false,
          canConfigureEmail: false,
          canSeeDownloadOwner: false,
          canManageApiKeys: false,
          canConfigureTolino: true,
        };
      }
    },
    enabled: isAuthenticated && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    // If user is admin, provide default permissions immediately
    placeholderData: isAdmin
      ? {
          canDeleteDownloads: true,
          canConfigureNotifications: true,
          canManageRequests: true,
          canStartDownloads: true,
          canConfigureApp: true,
          canConfigureIntegrations: true,
          canConfigureEmail: true,
          canSeeDownloadOwner: true,
          canManageApiKeys: true,
          canConfigureTolino: true,
        }
      : undefined,
  });
}
