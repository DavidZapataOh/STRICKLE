import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const npm = (...args) => execFileSync("npm", args, { cwd: root, encoding: "utf8" });

const workspaces = () =>
  JSON.parse(npm("query", ".workspace")).map((w) => ({ name: w.name, dir: join(root, w.location) }));

test("the root declares at least one workspace", () => {
  assert.ok(workspaces().length > 0);
});

test("every workspace defines lint, typecheck and test", () => {
  for (const { name, dir } of workspaces()) {
    const { scripts = {} } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const script of ["lint", "typecheck", "test"]) {
      assert.ok(scripts[script], `${name} is missing the "${script}" script`);
    }
  }
});

test("npm resolves every workspace dependency", () => {
  npm("ls", "--workspaces", "--depth=0");
});
