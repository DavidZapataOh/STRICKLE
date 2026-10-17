import type { ProofData } from "@aztec/bb.js";
import type { InputMap } from "@noir-lang/noir_js";
import { type Hex } from "viem";
import type { Note } from "./note.ts";
import { type SpendSpec } from "./witness.ts";
export type CircuitName = "shield" | "spend";
export declare const executeCircuit: (name: CircuitName, inputs: InputMap) => Promise<{
    witness: Uint8Array;
}>;
export declare const proveCircuit: (name: CircuitName, witness: Uint8Array) => Promise<ProofData>;
export declare const verifyCircuit: (name: CircuitName, proof: ProofData) => Promise<boolean>;
export declare const closeProver: () => Promise<void>;
export interface ProvedTransaction {
    proof: Hex;
    publicInputs: bigint[];
}
export interface ProvedSpend extends ProvedTransaction {
    /** The notes actually committed: self outputs carry the salt derived by the circuit. */
    outputNotes: Note[];
}
export declare function proveShield(note: Note, label: bigint): Promise<ProvedTransaction>;
export declare function proveSpend(spec: SpendSpec): Promise<ProvedSpend>;
