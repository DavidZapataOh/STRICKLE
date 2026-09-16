import { execFileSync } from "node:child_process";
import { checkToolchain } from "./toolchain.ts";

function compact(...args: string[]): string {
  try {
    return execFileSync("compact", ["compile", ...args], { encoding: "utf8" }).trim();
  } catch {
    console.error("compact is not installed or not on PATH");
    process.exit(1);
  }
}

const errors = checkToolchain({
  root: process.cwd(),
  compiler: {
    version: compact("--version"),
    language: compact("--language-version"),
    runtime: compact("--", "--runtime-version"),
  },
  nodeVersion: process.versions.node,
});

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("toolchain ok");
