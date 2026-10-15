import { readFile } from "node:fs/promises";
import type { CompiledCircuit } from "@noir-lang/noir_js";

/** Loads `<directory>/<name>.json` compiled artifacts from disk. */
export function nodeCircuitLoader(directory: URL | string): (name: string) => Promise<CompiledCircuit> {
  const base = typeof directory === "string" ? new URL(directory, "file:///") : directory;
  return async (name) => {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`invalid circuit name: ${name}`);
    return JSON.parse(await readFile(new URL(`${name}.json`, base), "utf8")) as CompiledCircuit;
  };
}
