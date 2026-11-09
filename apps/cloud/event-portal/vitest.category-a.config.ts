import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", include: ["test/category-a/**/*.test.tsx"],
    restoreMocks: true, clearMocks: true, testTimeout: 15000 },
});
