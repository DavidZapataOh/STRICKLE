/**
 * The viewers a wallet seals new notes for. Revoking a tier removes its key from every later envelope;
 * envelopes already published stay readable by the key that was valid then.
 */
export class ViewKeyRing {
    #accountant;
    #authority;
    #epochs = { accountant: 0, authority: 0 };
    owner;
    constructor(owner) {
        this.owner = owner;
    }
    setAccountant(publicKey) {
        this.#accountant = publicKey;
        this.#epochs.accountant++;
    }
    revokeAccountant() {
        this.#accountant = undefined;
        this.#epochs.accountant++;
    }
    setAuthority(publicKey) {
        this.#authority = publicKey;
        this.#epochs.authority++;
    }
    revokeAuthority() {
        this.#authority = undefined;
        this.#epochs.authority++;
    }
    epochs() {
        return { ...this.#epochs };
    }
    viewers() {
        const viewers = [{ tier: "owner", publicKey: this.owner.publicKey }];
        if (this.#accountant)
            viewers.push({ tier: "accountant", publicKey: this.#accountant });
        if (this.#authority)
            viewers.push({ tier: "authority", publicKey: this.#authority });
        return viewers;
    }
}
