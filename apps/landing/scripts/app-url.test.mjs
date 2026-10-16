import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const design = readFileSync(new URL("../src/lib/design.ts", import.meta.url), "utf8");

test("every call to action leads to a subdomain of our own domain", () => {
  const url = design.match(/export const APP_URL = "([^"]+)"/)?.[1];
  assert.ok(url, "APP_URL is defined");
  assert.match(new URL(url).hostname, /^([a-z0-9-]+\.)?strickle\.xyz$/);
});
