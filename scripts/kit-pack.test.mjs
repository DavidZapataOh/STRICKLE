import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { kitsOf, packKit } from "./kit-pack.mjs";


test("the kits and the internal packages each one needs", () => {
  const kits = kitsOf();
  assert.deepEqual(kits.map((kit) => kit.name).slice(0, 2), ["@strickle/pool", "@strickle/tax-engine"]);
  assert.deepEqual(kits[0].internal.sort(), ["@strickle/core", "@strickle/pool", "@strickle/prover"]);
  assert.deepEqual(kits[1].internal.sort(), ["@strickle/core", "@strickle/tax-engine"]);
});

test("a packed kit holds its build and its data and nothing else", () => {
  const out = mkdtempSync(join(tmpdir(), "kit-"));
  const tarballs = packKit("@strickle/tax-engine", out);
  assert.equal(tarballs.length, 2);
  const files = tarballs.flatMap((tarball) => execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n").filter(Boolean));
  assert.ok(files.includes("package/dist/index.js") && files.includes("package/dist/index.d.ts"));
  assert.ok(files.some((file) => file.startsWith("package/rules/MX/")));
  assert.deepEqual(files.filter((file) => /(^|\/)(tests?|node_modules)\/|\.env|\.pem$|\.ts$(?<!\.d\.ts)/.test(file)), []);
});

for (const kit of ["@strickle/tax-engine", "@strickle/pool"]) {
  test(`${kit} installs from its tarballs in an empty directory and runs its example`, { timeout: 600_000 }, () => {
    const out = mkdtempSync(join(tmpdir(), "kit-"));
    const tarballs = packKit(kit, out);
    const dir = mkdtempSync(join(tmpdir(), "install-"));
    execFileSync("npm", ["init", "-y"], { cwd: dir, stdio: "ignore" });
    execFileSync("npm", ["pkg", "set", "type=module"], { cwd: dir, stdio: "ignore" });
    execFileSync("npm", ["install", "--no-audit", "--no-fund", ...tarballs], { cwd: dir, stdio: "pipe" });
    const example = join(dir, "node_modules", ...kit.split("/"), "examples", `${kit.split("/")[1]}.mjs`);
    assert.ok(existsSync(example), `${example} is in the package`);
    const stdout = execFileSync("node", [example], { cwd: dir, encoding: "utf8" });
    assert.match(stdout, /\bok\b/);
  });
}
