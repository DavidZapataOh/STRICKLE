export interface ServiceInfo {
    version: string;
    publicKey: string;
    circuits: string[];
    maxBody: number;
    maxQueue: number;
}
export declare function fetchServiceInfo(url: string, pinnedKey?: Uint8Array, fetchImpl?: typeof fetch): Promise<ServiceInfo>;
export interface RemoteProveArgs {
    url: string;
    token: string;
    /** The service key the caller pinned out of band; the witness is sealed to it. */
    publicKey: Uint8Array;
    circuit: string;
    inputs: unknown;
    /** If given, the answer must carry exactly these public inputs. */
    expectedPublicInputs?: bigint[];
    /** Unix seconds. */
    now?: () => number;
    fetch?: typeof fetch;
}
/** Seals the witness to the service key, asks for a proof and checks the answer against what the caller expects. */
export declare function proveRemote(args: RemoteProveArgs): Promise<{
    proof: string;
    publicInputs: string[];
}>;
