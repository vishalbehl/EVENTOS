import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: {
    "@": path.resolve(__dirname, "."),
    "@eventos/form-builder-studio": path.resolve(__dirname, "../../../packages/form-builder-studio/src/index.ts"),
  } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["test/category-a/**/*.test.tsx", "test/category-a/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 15000,
  },
});
