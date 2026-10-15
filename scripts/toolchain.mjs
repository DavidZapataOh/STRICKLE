import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const pins = JSON.parse(readFileSync(new URL("../toolchain.json", import.meta.url), "utf8"));

export function releaseAssets(versions, platform = process.platform, arch = process.arch) {
  const os = { darwin: ["apple-darwin", "darwin"], linux: ["unknown-linux-gnu", "linux"] }[platform];
  const cpu = { arm64: ["aarch64", "arm64"], x64: ["x86_64", "amd64"] }[arch];
  if (!os || !cpu) throw new Error(`unsupported platform: ${platform}/${arch}`);
  return {
    nargo: {
      url: `https://github.com/noir-lang/noir/releases/download/v${versions.nargo}/noir-${cpu[0]}-${os[0]}.tar.gz`,
    },
    bb: {
      url: `https://github.com/AztecProtocol/aztec-packages/releases/download/v${versions.bb}/barretenberg-${cpu[1]}-${os[1]}.tar.gz`,
    },
  };
}

export function toolPaths(versions, home = homedir()) {
  const root = join(home, ".strickle", "toolchain");
  const nargoDir = join(root, `nargo-${versions.nargo}`, "bin");
  const bbDir = join(root, `bb-${versions.bb}`);
  return { nargoDir, bbDir, nargoBin: join(nargoDir, "nargo"), bbBin: join(bbDir, "bb"), pathEntries: [nargoDir, bbDir] };
}

async function download(url, directory) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`);
  const archive = join(mkdtempSync(join(tmpdir(), "toolchain-")), "archive.tar.gz");
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  mkdirSync(directory, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", directory]);
}

export async function install() {
  const paths = toolPaths(pins);
  const assets = releaseAssets(pins);
  if (!existsSync(paths.nargoBin)) await download(assets.nargo.url, paths.nargoDir);
  if (!existsSync(paths.bbBin)) await download(assets.bb.url, paths.bbDir);
  verify();
}

export function verify() {
  const paths = toolPaths(pins);
  const nargo = execFileSync(paths.nargoBin, ["--version"], { encoding: "utf8" });
  if (!nargo.includes(`nargo version = ${pins.nargo}`)) throw new Error(`nargo is not ${pins.nargo}: ${nargo.trim()}`);
  const bb = execFileSync(paths.bbBin, ["--version"], { encoding: "utf8" }).trim();
  if (bb.replace(/^v/, "") !== pins.bb) throw new Error(`bb is not ${pins.bb}: ${bb}`);
  console.log(`nargo ${pins.nargo}, bb ${pins.bb} ready in ${paths.nargoDir}`);
}

export function run(command, args, { cwd = process.cwd() } = {}) {
  const paths = toolPaths(pins);
  const env = { ...process.env, PATH: [...paths.pathEntries, process.env.PATH].join(":") };
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (import.meta.main) {
  const [action, ...rest] = process.argv.slice(2);
  if (action === "install") await install();
  else if (action === "verify") verify();
  else if (action === "run") {
    const cwdIndex = rest.indexOf("--cwd");
    const cwd = cwdIndex >= 0 ? rest.splice(cwdIndex, 2)[1] : undefined;
    const [command, ...args] = rest;
    process.exit(run(command, args, { cwd }));
  } else {
    console.error("usage: node scripts/toolchain.mjs <install|verify|run [--cwd dir] <command> ...>");
    process.exit(1);
  }
}
