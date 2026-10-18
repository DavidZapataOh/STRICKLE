import type { Asset } from "@strickle/core";
import { type Address } from "viem";
import { MerkleTree } from "./merkle.ts";
import type { Note } from "./note.ts";
import type { Policy } from "./policy.ts";
import { type SpendSpec } from "./witness.ts";
export type LiteSpec = Omit<SpendSpec, "tree" | "signer" | "allowlist" | "association"> & {
    signer: {
        kind: "agent";
        ak: bigint;
        nk: bigint;
        authHash: bigint;
    };
    allowlist?: {
        addresses: Address[];
        index: number;
    };
};
type Wire<T> = T extends bigint ? string : T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? {
    [K in keyof T]: Wire<T[K]>;
} : T;
export type WireSpec = Wire<LiteSpec>;
export declare const noteToWire: (n: Note) => {
    amount: string;
    ownerPk: string;
    policy: string;
    label: string;
    lockUntil: string;
    salt: string;
    box: import("@strickle/core").BoxKind;
    asset: Asset;
    flags: number;
    delayFloor: number;
};
export declare const noteFromWire: (w: Record<string, unknown>) => Note;
export declare const policyToWire: (p: Policy) => {
    floor: string;
    allowlistRoot: string;
    agentKeyHash: string;
    agentCap: string;
    templateRoot: string;
    restricted: boolean;
    agentActions: number;
    releaseDelay: number;
};
export declare const policyFromWire: (w: Record<string, unknown>) => Policy;
export declare function specToWire(spec: LiteSpec): WireSpec;
export declare function specFromWire(wire: unknown, tree: MerkleTree): SpendSpec;
export {};
