import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = ["page.tsx", "activity/page.tsx", "boxes/page.tsx", "settings/page.tsx"];

for (const page of pages) {
  test(`the ${page} route mounts the Pause control in the shell`, () => {
    const source = readFileSync(new URL(`../src/app/[lang]/${page}`, import.meta.url), "utf8");
    assert.match(source, /actions=\{<PauseControl /);
  });
}
