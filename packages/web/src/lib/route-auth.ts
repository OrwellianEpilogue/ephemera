import { redirect } from "@tanstack/react-router";
import { authClient } from "./auth-client";

// Cache setup status in memory - once complete, it stays complete
let setupCompleteCache: boolean | null = null;

/**
 * Check if setup is complete before allowing access
 * Redirects to /setup if not complete
 * Result is cached in memory to avoid repeated API calls
 */
export async function checkSetupComplete() {
  // Skip fetch if we've already verified setup is complete
  if (setupCompleteCache === true) {
    return;
  }

  try {
    const response = await fetch("/api/setup/status");
    const data = await response.json();

    if (!data.isSetupComplete) {
      setupCompleteCache = false;
      throw redirect({
        to: "/setup",
      });
    }

    // Cache the successful result
    setupCompleteCache = true;
  } catch (error) {
    // If error is already a redirect, rethrow it
    if (error && typeof error === "object" && "href" in error) {
      throw error;
    }

    // For network errors, log but don't redirect (allow app to load)
    console.error("[Setup Check] Error checking setup status:", error);
  }
}

/**
 * Reset the setup cache (call after setup completes)
 */
export function resetSetupCache() {
  setupCompleteCache = null;
}

/**
 * Check if user is authenticated for route protection
 * Call this in beforeLoad to protect routes
 *
 * @example
 * export const Route = createFileRoute('/protected')({
 *   beforeLoad: async () => {
 *     await requireAuth();
 *   },
 *   component: ProtectedPage,
 * });
 */
export async function requireAuth() {
  try {
    // First check if setup is complete
    await checkSetupComplete();

    // Get current session
    const session = await authClient.getSession();

    if (!session.data?.user) {
      // Not authenticated, redirect to login
      throw redirect({
        to: "/login",
        search: {
          // Preserve the redirect path for after login

          redirect: window.location.pathname,
        },
      });
    }

    return session.data;
  } catch (error) {
    // If error is already a redirect, rethrow it
    if (error && typeof error === "object" && "href" in error) {
      throw error;
    }

    // For other errors, also redirect to login
    console.error("[Route Auth] Error checking authentication:", error);
    throw redirect({
      to: "/login",
    });
  }
}

/**
 * Check if user is admin for admin-only routes
 * Call this in beforeLoad after requireAuth
 */
export async function requireAdmin() {
  const session = await requireAuth();

  if (session.user?.role !== "admin") {
    throw redirect({
      to: "/",
    });
  }

  return session;
}
