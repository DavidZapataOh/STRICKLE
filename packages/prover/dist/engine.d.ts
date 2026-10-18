import { type BackendOptions, type ProofData } from "@aztec/bb.js";
import { type CompiledCircuit, type InputMap } from "@noir-lang/noir_js";
/** 131,072 points (4 MiB compressed) cover every circuit up to 2^16 gates; bb.js defaults to four times that. */
export declare const SRS_SIZE = 131072;
export interface ProverOptions {
    loadCircuit(name: string): Promise<CompiledCircuit> | CompiledCircuit;
    backend?: BackendOptions;
}
export interface Prover {
    /** Loads the circuit and starts Barretenberg (WASM, CRS) so the first proof is fast; safe to call early, e.g. while a form is filled in. */
    prepare(name: string): Promise<void>;
    execute(name: string, inputs: InputMap): Promise<{
        witness: Uint8Array;
    }>;
    prove(name: string, witness: Uint8Array): Promise<ProofData>;
    verify(name: string, proof: ProofData): Promise<boolean>;
    /** Executes, proves, verifies and returns; throws if the proof does not verify. */
    proveInputs(name: string, inputs: InputMap): Promise<{
        proof: Uint8Array;
        publicInputs: string[];
    }>;
    destroy(): Promise<void>;
}
/** The same engine runs in Node and in the browser; circuits and the Barretenberg instance are created once, on demand. */
export declare function createProver(options: ProverOptions): Prover;
