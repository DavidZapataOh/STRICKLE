import type { Address } from "viem";
import type { ArcNetworkName } from "../networks.ts";

export type TransferSpeed = "fast" | "slow";
export type FeeMode = "source" | "destination";

export interface SourceChain {
  /** The kit's chain name. */
  id: string;
  label: string;
  chainId: number;
  /** CCTP domain. */
  domain: number;
  usdc: Address;
  explorerUrl: string;
  /** Endpoints we read this chain through, in order of preference. */
  rpc: readonly string[];
  /** Mainnet entries only: no swap quotes exist on testnet. */
  usdt?: { address: Address };
}

export type Fee = { kind: "provider" | "forwarder"; amount: bigint };

export interface BridgeLeg {
  kind: "bridge";
  source: SourceChain;
  speed: TransferSpeed;
  feeMode: FeeMode;
  fees: Fee[];
  /** The source chain's native-token network fee, when the kit can estimate it. */
  gas: { token: string; amount: string } | null;
}

/** Later legs (a swap in front of the bridge) join this union; the quote itself never changes shape. */
export type QuoteLeg = BridgeLeg;

export interface DepositQuote {
  network: ArcNetworkName;
  sourceAddress: Address;
  vault: Address;
  /** What the user typed: it leaves the wallet before fees. */
  amountSent: bigint;
  /** What leaves the wallet in total, fees included. */
  totalDebit: bigint;
  /** What reaches the vault: exact when `exact`, a floor otherwise. */
  amountReceivedMin: bigint;
  exact: boolean;
  legs: QuoteLeg[];
  /** Epoch milliseconds, or null when the provider quotes no expiry. */
  expiresAt: number | null;
  /** Handed back to the kit unchanged; never logged. */
  opaque: unknown;
}

export type QuoteRefusalCode = "below-minimum" | "fee-unknown" | "expired" | "unsupported-chain" | "unavailable" | "cost-too-high" | "stale";

export class QuoteRefusal extends Error {
  readonly code: QuoteRefusalCode;

  constructor(code: QuoteRefusalCode, message: string) {
    super(message);
    this.name = "QuoteRefusal";
    this.code = code;
  }
}
