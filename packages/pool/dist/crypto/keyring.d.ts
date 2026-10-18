import type { Viewer } from "./envelope.ts";
import type { ViewKey } from "./keys.ts";
/**
 * The viewers a wallet seals new notes for. Revoking a tier removes its key from every later envelope;
 * envelopes already published stay readable by the key that was valid then.
 */
export declare class ViewKeyRing {
    #private;
    readonly owner: ViewKey;
    constructor(owner: ViewKey);
    setAccountant(publicKey: Uint8Array): void;
    revokeAccountant(): void;
    setAuthority(publicKey: Uint8Array): void;
    revokeAuthority(): void;
    epochs(): {
        accountant: number;
        authority: number;
    };
    viewers(): Viewer[];
}
