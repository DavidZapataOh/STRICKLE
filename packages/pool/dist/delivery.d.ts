export declare const deliveryKey: (nk: bigint, nullifier0: bigint, index: number) => bigint;
export declare const deliverySalt: (key: bigint) => bigint;
export declare const deliveryPad: (key: bigint) => bigint;
export interface Delivery {
    amount: bigint;
    flags: number;
    lockUntil: bigint;
    delayFloor: number;
}
export declare function packDelivery({ amount, flags, lockUntil, delayFloor }: Delivery): bigint;
export declare function unpackDelivery(m: bigint): Delivery | undefined;
export declare const encryptDelivery: (m: bigint, key: bigint) => bigint;
export declare const decryptDelivery: (enc: bigint, key: bigint) => bigint;
