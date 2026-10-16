import type { DepositQuote, TransferSpeed } from "@strickle/arc/bridge/types";
import type { ArcNetworkName } from "@strickle/arc/networks";
import type { Address, Hex } from "viem";
import type { InjectedWallet } from "../wallet/injected.ts";

export type DepositStep = "chain" | "wallet" | "quote" | "sending" | "waiting" | "arrived" | "failed" | "held";
export type InputToken = "USDC" | "USDT";
export type DepositError = "no-wallet" | "rejected" | "wrong-chain" | "insufficient-funds" | "quote-refused" | "quote-expired" | "unavailable" | "timeout" | "cost-too-high" | "stale";

export interface DepositState {
  step: DepositStep;
  network: ArcNetworkName;
  sourceId: string | null;
  inputToken: InputToken;
  swapTx: Hex | null;
  /** What the conversion credited to the wallet, from its receipt. */
  converted: bigint | null;
  amount: bigint | null;
  speed: TransferSpeed;
  appliedSpeed: TransferSpeed | null;
  wallet: InjectedWallet | null;
  account: Address | null;
  quote: DepositQuote | null;
  depositId: string | null;
  burnTx: Hex | null;
  received: bigint | null;
  forwardTx: Hex | null;
  error: DepositError | null;
}

export type DepositEvent =
  | { type: "chain"; id: string }
  | { type: "token"; value: InputToken }
  | { type: "amount"; value: bigint | null }
  | { type: "swapped"; swapTx: Hex; credited: bigint }
  | { type: "held"; amount: bigint; swapTx: Hex }
  | { type: "resume-held" }
  | { type: "speed"; value: TransferSpeed }
  | { type: "speed-applied"; value: TransferSpeed | null }
  | { type: "wallet"; wallet: InjectedWallet; account: Address }
  | { type: "quoted"; quote: DepositQuote }
  | { type: "refused"; code: string }
  | { type: "sending"; depositId: string }
  | { type: "burned"; burnTx: Hex }
  | { type: "arrived"; received: bigint; forwardTx?: Hex }
  | { type: "failed"; error: DepositError }
  | { type: "reset" };

export const initialDeposit = (network: ArcNetworkName): DepositState => ({
  step: "chain",
  network,
  sourceId: null,
  inputToken: "USDC",
  swapTx: null,
  converted: null,
  amount: null,
  speed: "fast",
  appliedSpeed: null,
  wallet: null,
  account: null,
  quote: null,
  depositId: null,
  burnTx: null,
  received: null,
  forwardTx: null,
  error: null,
});

const EDITABLE: readonly DepositStep[] = ["chain", "wallet", "quote"];

const hasInput = (state: DepositState) => state.sourceId !== null && state.amount !== null && state.amount > 0n;

/** Changing what is being deposited voids the quote: it priced another transfer. */
function edited(state: DepositState, change: Partial<DepositState>): DepositState {
  const next = { ...state, ...change, quote: null, error: null };
  return { ...next, step: hasInput(next) ? "wallet" : "chain" };
}

export function depositReducer(state: DepositState, event: DepositEvent): DepositState {
  switch (event.type) {
    case "chain":
      return EDITABLE.includes(state.step) && event.id !== state.sourceId ? edited(state, { sourceId: event.id }) : state;
    case "token":
      return EDITABLE.includes(state.step) && event.value !== state.inputToken ? edited(state, { inputToken: event.value }) : state;
    case "swapped":
      return { ...state, swapTx: event.swapTx, converted: event.credited };
    case "held":
      return { ...state, step: "held", amount: event.amount, swapTx: event.swapTx, error: null };
    case "resume-held":
      return { ...initialDeposit(state.network), step: "wallet", sourceId: state.sourceId, wallet: state.wallet, account: state.account, inputToken: "USDC", amount: state.amount };
    case "amount":
      return EDITABLE.includes(state.step) && event.value !== state.amount ? edited(state, { amount: event.value }) : state;
    case "speed":
      return EDITABLE.includes(state.step) && event.value !== state.speed ? edited(state, { speed: event.value }) : state;
    case "speed-applied":
      return { ...state, appliedSpeed: event.value };
    case "wallet":
      if (!EDITABLE.includes(state.step)) return state;
      return { ...state, wallet: event.wallet, account: event.account, quote: null, error: null, step: hasInput(state) ? "quote" : "chain" };
    case "quoted":
      return EDITABLE.includes(state.step) ? { ...state, quote: event.quote, error: null, step: "quote" } : state;
    case "refused":
      return EDITABLE.includes(state.step) ? { ...state, quote: null, error: "quote-refused", step: hasInput(state) ? "wallet" : "chain" } : state;
    case "sending":
      return { ...state, step: "sending", depositId: event.depositId, error: null };
    case "burned":
      return { ...state, step: "waiting", burnTx: event.burnTx };
    case "arrived":
      return { ...state, step: "arrived", received: event.received, forwardTx: event.forwardTx ?? null, error: null };
    case "failed": {
      if (state.burnTx !== null) return event.error === "timeout" ? { ...state, step: "waiting", error: event.error } : { ...state, step: "failed", error: event.error };
      // the conversion mined but nothing was sent on: the USDC is in the wallet, so say so instead of offering a USDT quote the wallet can no longer fill
      if (state.swapTx !== null && state.converted !== null) return { ...state, step: "held", amount: state.converted, error: null };
      // nothing has left the wallet: every failure returns to the form, with the wallet still connected
      const quote = event.error === "quote-expired" || event.error === "stale" ? null : state.quote;
      const step = event.error === "no-wallet" ? (hasInput(state) ? "wallet" : "chain") : quote ? "quote" : hasInput(state) ? "wallet" : "chain";
      return { ...state, quote, step, depositId: null, error: event.error };
    }
    case "reset":
      return initialDeposit(state.network);
  }
}

/** A quote close to its end is asked for again before any wallet prompt, not merely refused at the end. */
export const needsRequote = (quote: DepositQuote | null, now: number, marginMs = 10_000): boolean => quote === null || (quote.expiresAt !== null && quote.expiresAt - now < marginMs);
