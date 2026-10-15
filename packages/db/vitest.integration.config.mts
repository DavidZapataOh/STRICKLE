import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // CI provides the variables directly.
}

export default defineConfig({
  test: { include: ["tests/integration/**/*.test.ts"], testTimeout: 30_000 },
});
