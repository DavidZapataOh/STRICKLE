import { defineConfig } from "@playwright/test";
import { viewportProjects } from "@strickle/gates";

const PORT = 3200;

export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  testIgnore: "live/**",
  fullyParallel: true,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: viewportProjects,
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
