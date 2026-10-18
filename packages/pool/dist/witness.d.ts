import type { Asset } from "@strickle/core";
import type { InputMap } from "@noir-lang/noir_js";
import type { MerkleTree } from "./merkle.ts";
import { type Note } from "./note.ts";
import type { Policy } from "./policy.ts";
export interface InputSpec {
    note: Note;
    policy: Policy;
    leafIndex: number;
}
export interface OutputSpec {
    note: Note;
    template?: {
        tree: MerkleTree;
        index: number;
    };
}
export type Signer = {
    kind: "user";
    sk: bigint;
} | {
    kind: "agent";
    ak: bigint;
    nk: bigint;
    authHash: bigint;
};
export interface SpendSpec {
    tree: MerkleTree;
    inputs: [InputSpec | null, InputSpec | null];
    outputs: [OutputSpec, OutputSpec];
    signer: Signer;
    publicAmount?: bigint;
    recipient?: bigint;
    asset?: Asset;
    now?: bigint;
    ciphertextHash?: bigint;
    allowlist?: {
        tree: MerkleTree;
        index: number;
    };
    association?: {
        tree: MerkleTree;
        index: number;
    };
    /** Both default to fresh random values: a dummy input reused across transactions would repeat its nullifier. */
    dummyNk?: [bigint, bigint];
    dummySalt?: [bigint, bigint];
    /** Delivery values for outputs the owner does not keep; default fresh random. */
    enc?: [bigint, bigint];
}
export declare function noteToInputs(note: Note): Record<string, string | number>;
export declare function recipientLeaf(recipient: bigint): bigint;
export declare function buildShieldInputs(args: {
    note: Note;
    label?: bigint;
}): {
    inputs: InputMap;
    publicInputs: bigint[];
};
export declare function withDummies(spec: SpendSpec): SpendSpec;
/** The notes a spend will actually commit and their delivery values; call `withDummies` first so the answer is stable. */
export declare function deriveOutputNotes(spec: SpendSpec): {
    notes: Note[];
    enc: bigint[];
    nullifiers: bigint[];
};
export declare function buildSpendInputs(input: SpendSpec): {
    inputs: InputMap;
    publicInputs: bigint[];
    outputNotes: Note[];
};
