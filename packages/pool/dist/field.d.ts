export declare const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export declare function assertField(value: bigint, name: string): void;
export declare function assertUint(value: bigint, bits: number, name: string): void;
export declare const toHex32: (value: bigint) => string;
/** A uniformly random 248-bit value, always below the field modulus. */
export declare function randomField(): bigint;
