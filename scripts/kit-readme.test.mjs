import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const SECTIONS = ["What it does", "Install", "Example", "What it does not do", "Tested on"];
const kits = ["pool", "tax-engine", "proof-of-income"].filter((kit) => existsSync(join(root, "packages", kit, "package.json")));
const cleanTrim = (text) => text.replace(/\s+$/, "");

for (const kit of kits) {
  const dir = join(root, "packages", kit);
  const readme = existsSync(join(dir, "README.md")) ? readFileSync(join(dir, "README.md"), "utf8") : "";

  test(`${kit} README has its five sections in order`, () => {
    const found = [...readme.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    assert.deepEqual(found, SECTIONS);
  });

  test(`${kit} README shows the example file it ships`, () => {
    const block = readme.match(/```js\n([\s\S]*?)```/)?.[1] ?? "";
    assert.equal(cleanTrim(block), cleanTrim(readFileSync(join(dir, "examples", `${kit}.mjs`), "utf8")));
  });

  test(`${kit} README names only scripts that exist and promises nothing`, () => {
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
    const own = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts;
    for (const [, name, workspace] of readme.matchAll(/npm run ([\w:-]+)(?: -w (@[\w/-]+))?/g)) {
      assert.ok(workspace ? own[name] : scripts[name], `npm run ${name} exists`);
    }
    assert.doesNotMatch(readme.replace(/ unaudited|safe harbor/gi, ""), /\b(audited|insured|guaranteed|risk-free)\b|\bsafe\b/i);
    assert.doesNotMatch(readme, /\bsprints?\b|\bS\d{2}\/\d{2}\b|PROYECTO/i);
  });

  test(`${kit} ships a licence through the root file`, () => {
    assert.ok(existsSync(join(root, "LICENSE")));
  });
}
