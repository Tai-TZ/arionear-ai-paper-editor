import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run in plain Node. They live outside vite.config.ts so the app config (built by
// @lovable.dev/vite-tanstack-config) doesn't have to type-check Vitest's `test` options.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
