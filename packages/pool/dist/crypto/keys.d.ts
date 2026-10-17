import { ristretto255 } from "@noble/curves/ed25519.js";
export declare const Point: typeof ristretto255.Point;
export declare const ORDER: bigint;
export interface ViewKey {
    secret: bigint;
    publicKey: Uint8Array;
}
/** Maps bytes to a uniform-enough scalar in 1..ORDER-1 (64 input bytes make the bias negligible). */
export declare const scalarFromBytes: (bytes: Uint8Array) => bigint;
export declare function viewKeyFromSecret(secret: bigint): ViewKey;
export declare const generateViewKey: () => ViewKey;
/** The owner's view key follows the spend secret, so a restored wallet needs nothing else. */
export declare function deriveOwnerViewKey(sk: bigint): ViewKey;
export declare const keyId: (publicKey: Uint8Array) => Uint8Array;
