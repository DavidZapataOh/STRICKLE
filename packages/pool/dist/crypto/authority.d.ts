export interface Share {
    index: number;
    value: bigint;
}
export interface Partial {
    index: number;
    point: Uint8Array;
}
/** Trusted-dealer Shamir sharing of the authority's view secret over the ristretto255 scalar field. */
export declare function dealAuthority(threshold: number, shares: number): {
    publicKey: Uint8Array;
    shares: Share[];
};
/** One holder's contribution to the Diffie-Hellman result; the share itself never leaves the holder. */
export declare function partialDecrypt(epk: Uint8Array, share: Share): Partial;
/** Combines partial results in the exponent: the group secret is never reassembled. */
export declare function combinePartials(partials: Partial[]): Uint8Array;
