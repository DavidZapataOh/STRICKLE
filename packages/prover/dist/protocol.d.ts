import { type ProverKey } from "./sealed.ts";
export type ProtocolCode = "malformed" | "stale" | "replayed" | "wrong-circuit";
/** The message is always exactly the code, so nothing about a request can leak through an error. */
export declare class ProtocolError extends Error {
    readonly code: ProtocolCode;
    constructor(code: ProtocolCode);
}
export interface ProveRequest {
    requestId: string;
    issuedAt: number;
    circuit: string;
    inputs: unknown;
}
export interface ProveBody {
    circuit: string;
    sealed: string;
}
export declare const MAX_AGE_SECONDS = 60;
export declare const MAX_FUTURE_SECONDS = 5;
export declare const aadFor: (circuit: string) => Uint8Array;
export declare function toBase64(bytes: Uint8Array): string;
export declare function encodeRequest(request: ProveRequest, serverPublicKey: Uint8Array): ProveBody;
export declare function encodeRequestWith(request: ProveRequest, serverPublicKey: Uint8Array, ephemeralSecret: bigint): ProveBody;
/** Remembers request ids for a while so an intercepted request cannot be played again. */
export declare class ReplayCache {
    #private;
    constructor(ttlSeconds: number);
    /** Returns true if the id was already present; otherwise records it and returns false. */
    seen(id: string, now: number): boolean;
}
export declare function decodeRequest(body: unknown, key: ProverKey, now: number, replay: ReplayCache): ProveRequest;
