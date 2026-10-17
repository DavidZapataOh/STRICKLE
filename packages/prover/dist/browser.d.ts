import type { CompiledCircuit } from "@noir-lang/noir_js";
/** Loads `<baseUrl>/<name>.json` compiled circuits over HTTP. */
export declare function urlCircuitLoader(baseUrl: string): (name: string) => Promise<CompiledCircuit>;
/**
 * Serves the reference string from our own origin: requests to the two CDN hosts are rewritten to
 * `<baseUrl>/<file>` (range headers preserved). Returns a function that restores the original `fetch`.
 */
export declare function hostedCrs(baseUrl: string): () => void;
