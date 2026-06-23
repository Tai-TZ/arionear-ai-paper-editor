// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Default dev backend port is 8000 (override via VITE_DEV_API_PROXY).
const DEV_API_PROXY = process.env.VITE_DEV_API_PROXY || "http://127.0.0.1:8000";

export default defineConfig({
  vite: {
    preview: {
      allowedHosts: ["localhost", "127.0.0.1"],
    },
    server: {
      allowedHosts: ["localhost", "127.0.0.1"],
      proxy: {
        "/api/v1": {
          target: DEV_API_PROXY,
          changeOrigin: true,
          ws: true,
          timeout: 0,
          proxyTimeout: 0,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              if (req.url?.includes("/chat/stream")) {
                proxyReq.setHeader("Accept", "text/event-stream");
                proxyReq.setHeader("Cache-Control", "no-cache");
              }
            });
            proxy.on("proxyRes", (proxyRes, req) => {
              if (req.url?.includes("/chat/stream")) {
                delete proxyRes.headers["content-length"];
                proxyRes.headers["cache-control"] = "no-cache, no-transform";
                proxyRes.headers["x-accel-buffering"] = "no";
              }
            });
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    // Cloud Run / Docker: standard Node HTTP server (default Lovable preset is cloudflare).
    preset: "node-server",
  },
});
