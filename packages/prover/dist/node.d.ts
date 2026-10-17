import type { CompiledCircuit } from "@noir-lang/noir_js";
/** Loads `<directory>/<name>.json` compiled artifacts from disk. */
export declare function nodeCircuitLoader(directory: URL | string): (name: string) => Promise<CompiledCircuit>;
