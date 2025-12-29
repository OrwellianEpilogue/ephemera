import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// Get API base path from environment variable (default: /api)
const API_BASE_PATH = (process.env.API_BASE_PATH || "/api")
  .replace(/\/+$/, "") // Remove trailing slashes
  .replace(/^([^/])/, "/$1"); // Ensure leading slash

// https://vite.dev/config/
export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React + Mantine bundled together to prevent initialization race conditions
          // Separating these causes "useLayoutEffect of undefined" errors when
          // Mantine tries to access React before the React chunk is evaluated
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/@mantine/") ||
            id.includes("node_modules/@floating-ui/")
          ) {
            return "vendor-react";
          }
          // TanStack libraries
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-tanstack";
          }
          // Icons (large library)
          if (id.includes("node_modules/@tabler/icons-react")) {
            return "vendor-icons";
          }
          // Date utilities
          if (id.includes("node_modules/date-fns")) {
            return "vendor-utils";
          }
        },
      },
    },
  },
  server: {
    port: 5222,
    proxy: {
      [API_BASE_PATH]: {
        target: "http://localhost:8286",
        changeOrigin: true,
        // Configure proxy to handle SSE streaming
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            // Disable buffering for SSE endpoints
            if (req.url?.includes("/queue/stream")) {
              proxyReq.setHeader("X-Accel-Buffering", "no");
            }
          });
        },
      },
    },
  },
});
