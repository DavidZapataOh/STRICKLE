import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const readme = readFileSync(join(root, "README.md"), "utf8");
const FIRST = "In Athens, the misthos was the wage that let a rowing hand live from their work. Strickle proposes that pay follow the work: when a freelancer's work arrives in bursts, their agent turns irregular income into a steady salary, with taxes set aside and the cushion protected, all in private.";
const rootScripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
const workspaces = new Map();
for (const dir of ["apps", "packages", "workflows"]) {
  for (const name of existsSync(join(root, dir)) ? readdirSync(join(root, dir)) : []) {
    const file = join(root, dir, name, "package.json");
    if (existsSync(file)) workspaces.set(JSON.parse(readFileSync(file, "utf8")).name, JSON.parse(readFileSync(file, "utf8")).scripts ?? {});
  }
}
workspaces.set("@strickle/contracts", JSON.parse(readFileSync(join(root, "contracts/package.json"), "utf8")).scripts);

test("the first line is the framing sentence", () => {
  assert.equal(readme.split("\n")[0], FIRST);
});

test("every path and link it names exists", () => {
  const paths = [...readme.matchAll(/`((?:apps|packages|contracts|circuits|workflows|docs)\/[\w./-]*|toolchain\.json|LICENSE|\.env\.example)`/g)].map((match) => match[1]);
  const links = [...readme.matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((match) => match[1]);
  assert.ok(paths.length > 8 && links.length >= 2);
  for (const path of [...paths, ...links]) assert.ok(existsSync(join(root, path)) || existsSync(join(root, dirname(path))), `${path} exists`);
});

test("every command it shows resolves to a script", () => {
  const commands = [...readme.matchAll(/^(?:npm run ([\w:-]+)(?: -w (\S+))?|npm (test|install))/gm)];
  assert.ok(commands.length >= 6);
  for (const [, script, workspace, builtin] of commands) {
    if (builtin) continue;
    assert.ok(workspace ? workspaces.get(workspace)?.[script] : rootScripts[script], `npm run ${script} ${workspace ?? ""}`);
  }
  assert.ok(existsSync(join(root, ".env.example")));
});

test("it holds no placeholder, no promise and no reference to the private process", () => {
  assert.doesNotMatch(readme, /\b(TODO|TBD)\b|your-|example\.com|lorem/i);
  assert.doesNotMatch(readme.replace(/ unaudited/g, ""), /\b(audited|insured|guaranteed|risk-free)\b|\bsafe\b/i);
  assert.doesNotMatch(readme, /\bsprints?\b|\bS\d{2}\/\d{2}\b|PROYECTO/i);
});
