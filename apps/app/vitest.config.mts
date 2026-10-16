import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": src,
      // the real module throws outside a React Server Components build
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.{ts,tsx}"], exclude: ["tests/live/**", "tests/integration/**", "node_modules/**"], environment: "node" },
});
