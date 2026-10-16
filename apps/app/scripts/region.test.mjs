import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the functions run next to the database", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.regions, ["iad1"]);
});
