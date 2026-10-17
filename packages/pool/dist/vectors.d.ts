export interface PoolVectors {
    hash: {
        inputs: string[];
        out: string;
    }[];
    keys: {
        sk: string;
        pk: string;
        authHash: string;
        nk: string;
        ak: string;
        agentKeyHash: string;
    }[];
    policies: {
        floor: string;
        allowlistRoot: string;
        restricted: number;
        agentKeyHash: string;
        agentCap: string;
        agentActions: number;
        releaseDelay: number;
        templateRoot: string;
        hash: string;
    }[];
    notes: {
        amount: string;
        ownerPk: string;
        policy: string;
        label: string;
        box: number;
        asset: number;
        flags: number;
        lockUntil: string;
        delayFloor: number;
        salt: string;
        meta: string;
        commitment: string;
    }[];
    nullifiers: {
        nk: string;
        commitment: string;
        leafIndex: number;
        nullifier: string;
    }[];
    merkle: {
        zeros: string[];
        pairs: {
            a: string;
            b: string;
            root: string;
        }[];
        paths: {
            index: number;
            leaf: string;
            siblings: string[];
            root: string;
        }[];
        small: {
            depth: number;
            index: number;
            leaf: string;
            siblings: string[];
            root: string;
        }[];
    };
    delivery: {
        nk: string;
        nullifier0: string;
        index: number;
        amount: string;
        flags: number;
        lockUntil: string;
        delayFloor: number;
        key: string;
        salt: string;
        pad: string;
        packed: string;
        enc: string;
    }[];
}
export declare function buildVectors(): PoolVectors;
export declare function renderNoirTests(v: PoolVectors): string;
export declare function renderNoirMerkleTests(v: PoolVectors): string;
export declare function renderSolidityZeros(v: PoolVectors): string;
