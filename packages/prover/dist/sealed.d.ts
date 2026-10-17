export interface ProverKey {
    secret: bigint;
    publicKey: Uint8Array;
}
export declare function generateProverKey(): ProverKey;
export declare const scalarFrom: (bytes: Uint8Array) => bigint;
export declare function sealWith(plaintext: Uint8Array, recipientPublicKey: Uint8Array, aad: Uint8Array, ephemeralSecret: bigint): Uint8Array;
/** `version | epk | ciphertext+tag`, readable only by the holder of the recipient key and only under the same associated data. */
export declare const seal: (plaintext: Uint8Array, recipientPublicKey: Uint8Array, aad: Uint8Array) => Uint8Array;
export declare function open(sealed: Uint8Array, secret: bigint, publicKey: Uint8Array, aad: Uint8Array): Uint8Array | undefined;
