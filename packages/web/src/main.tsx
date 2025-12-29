import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { configureClient, getApiBasePath } from "@ephemera/shared";

// Import Mantine styles
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";

// Unregister any existing service workers from old PWA implementation
// This ensures users who had the PWA version don't have stale cached content
/* eslint-disable no-undef */
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log("[Service Worker] Unregistered old service worker");
        }
      });
    }
  });
}
/* eslint-enable no-undef */

const customPrimaryLight = [
  "#ebe9ff",
  "#d1cdff",
  "#b3adff",
  "#9589ff",
  "#7866ff",
  "#5c43ff",
  "#362EFF",
  "#2920cc",
  "#1f1899",
  "#150f66",
] as const;

const customPrimaryDark = [
  "#f7ecff",
  "#e7d6fb",
  "#caaaf1",
  "#ac7ce8",
  "#9354e0",
  "#833bdb",
  "#7b2eda",
  "#6921c2",
  "#5d1cae",
  "#501599",
] as const;

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Configure the API client with auto-detected base path
// The base path is injected by the backend as a meta tag
configureClient({
  baseUrl: getApiBasePath(),
});

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Create a query client with global error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: unknown) => {
        // Don't retry on 401 (authentication) or 403 (forbidden) errors
        if (error && typeof error === "object" && "status" in error) {
          const statusError = error as { status: number };
          if (statusError.status === 401 || statusError.status === 403) {
            return false;
          }
        }
        // Retry other errors once
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error: unknown) => {
        // Handle 401 errors globally - redirect to login
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 401
        ) {
          console.warn(
            "[Query Client] 401 Unauthorized - redirecting to login",
          );

          window.location.href = "/login";
        }
      },
    },
  },
});

// Create theme with primary color (light mode colors)
const theme = createTheme({
  primaryColor: "custom-primary",
  colors: {
    "custom-primary": customPrimaryLight,
  },
});

// CSS Variables Resolver - override colors for dark mode
const cssVariablesResolver = () => ({
  variables: {},
  light: {},
  dark: {
    "--mantine-color-custom-primary-0": customPrimaryDark[0],
    "--mantine-color-custom-primary-1": customPrimaryDark[1],
    "--mantine-color-custom-primary-2": customPrimaryDark[2],
    "--mantine-color-custom-primary-3": customPrimaryDark[3],
    "--mantine-color-custom-primary-4": customPrimaryDark[4],
    "--mantine-color-custom-primary-5": customPrimaryDark[5],
    "--mantine-color-custom-primary-6": customPrimaryDark[6],
    "--mantine-color-custom-primary-7": customPrimaryDark[7],
    "--mantine-color-custom-primary-8": customPrimaryDark[8],
    "--mantine-color-custom-primary-9": customPrimaryDark[9],
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        defaultColorScheme="auto"
        cssVariablesResolver={cssVariablesResolver}
      >
        <Notifications position="top-right" />
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
);
