import type { Address } from "viem";

type Store = Pick<Storage, "getItem" | "setItem">;

const key = (vault: Address) => `strickle.nonce.v1:${vault.toLowerCase()}`;

export function createNonceStore(storage: Store | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  return {
    last(vault: Address): bigint | null {
      try {
        const raw = storage?.getItem(key(vault));
        return raw && /^[0-9]{1,30}$/.test(raw) ? BigInt(raw) : null;
      } catch {
        return null;
      }
    },
    remember(vault: Address, nonce: bigint): void {
      try {
        const current = this.last(vault);
        if (current === null || nonce > current) storage?.setItem(key(vault), nonce.toString());
      } catch {
        // storage can be unavailable (private windows): the chain-time rule still bounds the nonce
      }
    },
  };
}
