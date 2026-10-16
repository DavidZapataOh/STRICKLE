import type { ArcNetworkName } from "../networks.ts";
import type { SourceChain } from "./types.ts";

export const ARC_DOMAIN = 26;
export const ARC_KIT_CHAIN = { testnet: "Arc_Testnet", mainnet: "Arc" } as const satisfies Record<ArcNetworkName, string>;

const testnet: readonly SourceChain[] = [
  { id: "Ethereum_Sepolia", label: "Ethereum", chainId: 11155111, domain: 0, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", explorerUrl: "https://sepolia.etherscan.io", rpc: ["https://ethereum-sepolia-rpc.publicnode.com"] },
  { id: "Base_Sepolia", label: "Base", chainId: 84532, domain: 6, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", explorerUrl: "https://sepolia.basescan.org", rpc: ["https://sepolia.base.org"] },
  { id: "Avalanche_Fuji", label: "Avalanche", chainId: 43113, domain: 1, usdc: "0x5425890298aed601595a70AB815c96711a31Bc65", explorerUrl: "https://subnets-test.avax.network/c-chain", rpc: ["https://api.avax-test.network/ext/bc/C/rpc"] },
  { id: "Arbitrum_Sepolia", label: "Arbitrum", chainId: 421614, domain: 3, usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", explorerUrl: "https://sepolia.arbiscan.io", rpc: ["https://sepolia-rollup.arbitrum.io/rpc"] },
  { id: "Optimism_Sepolia", label: "Optimism", chainId: 11155420, domain: 2, usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7", explorerUrl: "https://sepolia-optimistic.etherscan.io", rpc: ["https://sepolia.optimism.io"] },
];

const mainnet: readonly SourceChain[] = [
  { id: "Ethereum", label: "Ethereum", chainId: 1, domain: 0, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", explorerUrl: "https://etherscan.io", rpc: ["https://ethereum-rpc.publicnode.com"] },
  { id: "Base", label: "Base", chainId: 8453, domain: 6, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", explorerUrl: "https://basescan.org", rpc: ["https://mainnet.base.org"] },
  { id: "Arbitrum", label: "Arbitrum", chainId: 42161, domain: 3, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", explorerUrl: "https://arbiscan.io", rpc: ["https://arb1.arbitrum.io/rpc"] },
  { id: "Optimism", label: "Optimism", chainId: 10, domain: 2, usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", explorerUrl: "https://optimistic.etherscan.io", rpc: ["https://mainnet.optimism.io"] },
  { id: "Avalanche", label: "Avalanche", chainId: 43114, domain: 1, usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", explorerUrl: "https://subnets.avax.network/c-chain", rpc: ["https://api.avax.network/ext/bc/C/rpc"] },
  { id: "Polygon", label: "Polygon", chainId: 137, domain: 7, usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", explorerUrl: "https://polygonscan.com", rpc: ["https://polygon.publicnode.com"] },
];

const byNetwork: Record<ArcNetworkName, readonly SourceChain[]> = { testnet, mainnet };

export const sourceChainsFor = (network: ArcNetworkName): readonly SourceChain[] => byNetwork[network];

export function sourceChain(network: ArcNetworkName, id: string): SourceChain {
  const found = byNetwork[network].find((entry) => entry.id === id);
  if (!found) throw new Error(`${id} is not offered as a source on ${network}`);
  return found;
}
