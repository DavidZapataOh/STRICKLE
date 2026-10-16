import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const runbook = readFileSync(join(root, "docs/mainnet-runbook.md"), "utf8");

const workspaces = new Map();
for (const group of ["apps", "packages", "workflows"]) {
  for (const dir of readdirSync(join(root, group))) {
    const file = join(root, group, dir, "package.json");
    if (existsSync(file)) {
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      workspaces.set(pkg.name, pkg.scripts ?? {});
    }
  }
}
const contracts = JSON.parse(readFileSync(join(root, "contracts/package.json"), "utf8"));
workspaces.set(contracts.name, contracts.scripts ?? {});

const commands = [...runbook.matchAll(/^\s*(?:\$ )?npm run ([\w:-]+)(?: -w ([@\w/.-]+))?/gm)].map((match) => ({ script: match[1], workspace: match[2] }));

test("the runbook names at least the emergency commands", () => {
  const names = commands.map((command) => command.script);
  for (const needed of ["wave", "migrate", "db:ping", "probe", "record-metrics"]) assert.ok(names.includes(needed), `the runbook does not mention ${needed}`);
});

test("every npm script the runbook names exists", () => {
  for (const { script, workspace } of commands) {
    if (!workspace) assert.ok(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts[script], `root script ${script} is missing`);
    else assert.ok(workspaces.get(workspace)?.[script], `${workspace} has no script ${script}`);
  }
});

test("the runbook states what Strickle cannot do and that the private pool stays off", () => {
  assert.match(runbook, /cannot move or freeze/i);
  assert.match(runbook, /private pool is off on mainnet/i);
  assert.doesNotMatch(runbook, /guardian/i);
});

test("the wave commands the runbook shows are the ones the program accepts", () => {
  const shown = [...runbook.matchAll(/npm run wave -w app -- (\w+)/g)].map((match) => match[1]);
  for (const command of ["status", "open", "advance", "incident", "resolve", "invite", "revoke", "next"]) assert.ok(shown.includes(command), `the runbook does not show wave ${command}`);
});
