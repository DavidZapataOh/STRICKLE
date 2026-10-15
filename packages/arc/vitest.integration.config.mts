import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // CI provides the variables directly.
}

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.live.test.ts"],
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
