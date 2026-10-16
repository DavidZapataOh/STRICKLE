import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // CI provides the variables directly.
}

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": src, "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)) } },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 30_000, hookTimeout: 30_000, fileParallelism: false },
});
