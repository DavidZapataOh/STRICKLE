// Packs a standalone kit and the internal packages it imports as tarballs, from their compiled output.
//   node scripts/kit-pack.mjs @strickle/pool [outDir]
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const VERSION = "0.1.0";
const REPOSITORY = "https://github.com/DavidZapataOh/STRICKLE";
const KITS = ["pool", "tax-engine", "proof-of-income"];
const DATA = { "tax-engine": ["rules", "calendars", "fx"] };
const dirOf = (name) => join(root, "packages", name.split("/")[1]);
const manifestOf = (name) => JSON.parse(readFileSync(join(dirOf(name), "package.json"), "utf8"));

function closure(name, seen = new Set()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  for (const dep of Object.keys(manifestOf(name).dependencies ?? {})) if (dep.startsWith("@strickle/")) closure(dep, seen);
  return seen;
}

export const kitsOf = () =>
  KITS.filter((short) => existsSync(join(root, "packages", short, "package.json"))).map((short) => {
    const name = `@strickle/${short}`;
    return { name, dir: dirOf(name), internal: [...closure(name)] };
  });

const dist = (target) => (typeof target === "string" ? { types: target.replace(/^\.\/src\/(.*)\.ts$/, "./dist/$1.d.ts"), default: target.replace(/^\.\/src\/(.*)\.ts$/, "./dist/$1.js") } : target);

function stage(name, out) {
  const manifest = manifestOf(name);
  const dir = dirOf(name);
  const target = join(out, "stage", name.split("/")[1]);
  mkdirSync(target, { recursive: true });
  cpSync(join(dir, "dist"), join(target, "dist"), { recursive: true });
  for (const entry of [...(DATA[name.split("/")[1]] ?? []), "examples", "README.md"]) if (existsSync(join(dir, entry))) cpSync(join(dir, entry), join(target, entry), { recursive: true });
  cpSync(join(root, "LICENSE"), join(target, "LICENSE"));
  if (name === "@strickle/pool") cpSync(join(root, "circuits", "target"), join(target, "circuits"), { recursive: true });
  const internal = Object.fromEntries(Object.entries(manifest.dependencies ?? {}).map(([dep, range]) => [dep, dep.startsWith("@strickle/") ? VERSION : range]));
  const published = {
    name,
    version: VERSION,
    description: manifest.description,
    license: "MIT",
    type: "module",
    repository: { type: "git", url: `git+${REPOSITORY}.git`, directory: `packages/${name.split("/")[1]}` },
    engines: { node: ">=24" },
    exports: Object.fromEntries(Object.entries(manifest.exports).map(([key, value]) => [key, dist(value)])),
    dependencies: internal,
  };
  writeFileSync(join(target, "package.json"), `${JSON.stringify(published, null, 2)}\n`);
  return target;
}

/** Builds the kit, stages each package of its closure with the published manifest and packs them; returns the tarball paths. */
export function packKit(name, out = mkdtempSync(join(tmpdir(), "kit-"))) {
  execFileSync("npx", ["tsc", "-b", join(dirOf(name), "tsconfig.build.json")], { cwd: root, stdio: "inherit" });
  return [...closure(name)].map((pkg) => {
    const file = execFileSync("npm", ["pack", "--silent", "--pack-destination", out, stage(pkg, out)], { encoding: "utf8" }).trim().split("\n").pop();
    return join(out, file);
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [name, out] = process.argv.slice(2);
  if (!name || !kitsOf().some((kit) => kit.name === name)) throw new Error(`usage: kit-pack.mjs <${kitsOf().map((kit) => kit.name).join("|")}> [outDir]`);
  console.log(packKit(name, out).join("\n"));
}
