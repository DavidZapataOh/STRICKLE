import { defineConfig } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "tests/live",
  testMatch: "*.live.spec.ts",
  workers: 1,
  timeout: 900_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: { command: `npm run build && npm run start -- --port ${PORT}`, url: `http://localhost:${PORT}/en`, reuseExistingServer: false, timeout: 180_000 },
});
