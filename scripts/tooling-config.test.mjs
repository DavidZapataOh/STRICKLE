import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

const eslint = (code) =>
  spawnSync("npx", ["eslint", "--stdin", "--stdin-filename", "packages/example/src/a.ts"], {
    cwd: root,
    input: code,
    encoding: "utf8",
  });

function tsc(code) {
  const dir = mkdtempSync(join(tmpdir(), "tsconfig-base-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: join(root, "tsconfig.base.json"), include: ["*.ts"] }));
  writeFileSync(join(dir, "a.ts"), code);
  return spawnSync("npx", ["tsc", "-p", dir], { cwd: root, encoding: "utf8" });
}

test("eslint accepts clean code and rejects explicit any", () => {
  assert.equal(eslint("export const a = 1;\n").status, 0);
  assert.notEqual(eslint("export const a: any = 1;\n").status, 0);
});

test("tsconfig.base accepts clean code", () => {
  const result = tsc("export const a = 1;\n");
  assert.equal(result.status, 0, result.stdout);
});

test("tsconfig.base rejects syntax Node cannot strip", () => {
  assert.notEqual(tsc("export enum Color { Red }\n").status, 0);
});

test("tsconfig.base rejects unchecked indexed access", () => {
  assert.notEqual(tsc("const xs: number[] = [];\nexport const x: number = xs[0];\n").status, 0);
});
