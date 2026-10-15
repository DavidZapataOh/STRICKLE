import type { Viewer } from "./envelope.ts";
import type { ViewKey } from "./keys.ts";

/**
 * The viewers a wallet seals new notes for. Revoking a tier removes its key from every later envelope;
 * envelopes already published stay readable by the key that was valid then.
 */
export class ViewKeyRing {
  #accountant: Uint8Array | undefined;
  #authority: Uint8Array | undefined;
  #epochs = { accountant: 0, authority: 0 };

  readonly owner: ViewKey;

  constructor(owner: ViewKey) {
    this.owner = owner;
  }

  setAccountant(publicKey: Uint8Array): void {
    this.#accountant = publicKey;
    this.#epochs.accountant++;
  }

  revokeAccountant(): void {
    this.#accountant = undefined;
    this.#epochs.accountant++;
  }

  setAuthority(publicKey: Uint8Array): void {
    this.#authority = publicKey;
    this.#epochs.authority++;
  }

  revokeAuthority(): void {
    this.#authority = undefined;
    this.#epochs.authority++;
  }

  epochs(): { accountant: number; authority: number } {
    return { ...this.#epochs };
  }

  viewers(): Viewer[] {
    const viewers: Viewer[] = [{ tier: "owner", publicKey: this.owner.publicKey }];
    if (this.#accountant) viewers.push({ tier: "accountant", publicKey: this.#accountant });
    if (this.#authority) viewers.push({ tier: "authority", publicKey: this.#authority });
    return viewers;
  }
}
