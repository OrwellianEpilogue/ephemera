import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

// Get API base path from environment variable (default: /api)
const API_BASE_PATH = (process.env.API_BASE_PATH || "/api")
  .replace(/\/+$/, "") // Remove trailing slashes
  .replace(/^([^/])/, "/$1"); // Ensure leading slash

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "apple-touch-icon-152x152.png",
        "apple-touch-icon-180x180.png",
        "apple-touch-icon-167x167.png",
      ],
      manifest: {
        name: "Ephemera",
        short_name: "Ephemera",
        description: "Ephemera Application",
        theme_color: "#362EFF",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
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
