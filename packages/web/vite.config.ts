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
