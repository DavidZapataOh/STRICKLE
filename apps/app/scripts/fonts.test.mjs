import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const app = new URL("../src/fonts/", import.meta.url);
const landing = new URL("../../landing/src/fonts/", import.meta.url);

test("the app ships the same font files as the landing, byte for byte", () => {
  const files = readdirSync(landing).sort();
  assert.deepEqual(readdirSync(app).sort(), files);
  for (const file of files) assert.ok(readFileSync(new URL(file, app)).equals(readFileSync(new URL(file, landing))), `${file} differs`);
});
