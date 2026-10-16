import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": src, "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)) } },
  test: { include: ["tests/live/**/*.live.test.ts"], environment: "node", testTimeout: 600_000, hookTimeout: 600_000 },
});
