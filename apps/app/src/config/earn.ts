import type { Address } from "viem";

export type EarnVault = { address: Address; name: string; protocol: string };

/** The yield vaults an account may point a box at: the address is what the agent checks, the name and the protocol are what the person reads. The agent's configuration lists the same ones. */
export const EARN_VAULTS: Record<"testnet" | "mainnet", readonly EarnVault[]> = {
  testnet: [{ address: "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88", name: "EarnKit USDC Vault", protocol: "Morpho" }],
  mainnet: [],
};

export const earnVaultsFor = (network: "testnet" | "mainnet"): readonly EarnVault[] => EARN_VAULTS[network];
