import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@eventos/form-builder-studio": path.resolve(__dirname, "../../../packages/form-builder-studio/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    testTimeout: 15_000,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    globals: false,
  },
});
