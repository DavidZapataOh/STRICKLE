import { type Hex } from "viem";
import type { Note } from "../note.ts";
import type { Policy } from "../policy.ts";
export type Tier = "owner" | "accountant" | "authority";
export interface Viewer {
    tier: Tier;
    publicKey: Uint8Array;
}
export interface OutputPlaintext {
    note: Note;
    policy: Policy;
    viewers: Viewer[];
}
/** Either the viewer's secret scalar, or a shared secret already combined from threshold partials. */
export type Opener = {
    publicKey: Uint8Array;
    secret: bigint;
    sharedSecret?: undefined;
} | {
    publicKey: Uint8Array;
    sharedSecret: Uint8Array;
    secret?: undefined;
};
export declare function sealEnvelopeWith(outputs: [OutputPlaintext | null, OutputPlaintext | null], seed: Uint8Array): Hex;
export declare const sealEnvelope: (outputs: [OutputPlaintext | null, OutputPlaintext | null]) => Hex;
export declare function envelopeEpk(envelope: Hex): Uint8Array;
export declare function openSection(envelope: Hex, outputIndex: 0 | 1, tier: Tier, opener: Opener): Uint8Array | undefined;
