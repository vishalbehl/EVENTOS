import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.COMMAND_CENTER_E2E_PORT || 3000);
const baseURL = process.env.COMMAND_CENTER_E2E_BASE_URL || `http://localhost:${port}`;
const shouldStartServer = Boolean(process.env.CI || process.env.COMMAND_CENTER_E2E_START_SERVER === "1");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.COMMAND_CENTER_E2E_BASE_URL || !shouldStartServer
    ? undefined
    : {
        command: `node ../../../node_modules/next/dist/bin/next dev --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
