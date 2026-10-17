import type { Asset, BoxKind } from "@strickle/core";
import type { Note } from "../note.ts";
import type { Policy } from "../policy.ts";
export declare const OWNER_PAYLOAD = 269;
export declare const ACCOUNTANT_PAYLOAD = 51;
export declare const AUTHORITY_PAYLOAD = 41;
export declare function encodeOwnerPayload({ note, policy }: {
    note: Note;
    policy: Policy;
}): Uint8Array;
export declare function decodeOwnerPayload(bytes: Uint8Array): {
    note: Note;
    policy: Policy;
};
export interface AccountantView {
    amount: bigint;
    asset: Asset;
    box: BoxKind;
    flags: number;
    lockUntil: bigint;
    label: bigint;
}
export declare function encodeAccountantPayload(note: Note): Uint8Array;
export declare function decodeAccountantPayload(bytes: Uint8Array): AccountantView;
export interface AuthorityView {
    amount: bigint;
    asset: Asset;
    label: bigint;
}
export declare function encodeAuthorityPayload(note: Note): Uint8Array;
export declare function decodeAuthorityPayload(bytes: Uint8Array): AuthorityView;
