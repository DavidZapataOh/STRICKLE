import type { DepositQuote, TransferSpeed } from "@strickle/arc/bridge/types";
import type { ArcNetworkName } from "@strickle/arc/networks";
import type { Address, Hex } from "viem";
import type { InjectedWallet } from "../wallet/injected.ts";

export type DepositStep = "chain" | "wallet" | "quote" | "sending" | "waiting" | "arrived" | "failed";
export type DepositError = "no-wallet" | "rejected" | "wrong-chain" | "insufficient-funds" | "quote-refused" | "quote-expired" | "unavailable" | "timeout";

export interface DepositState {
  step: DepositStep;
  network: ArcNetworkName;
  sourceId: string | null;
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
  | { type: "amount"; value: bigint | null }
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

const RECOVERABLE: readonly DepositError[] = ["rejected", "wrong-chain", "insufficient-funds", "quote-refused", "quote-expired"];
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
    case "failed":
      if (state.burnTx !== null) return { ...state, step: "failed", error: event.error };
      if (event.error === "no-wallet") return { ...state, step: hasInput(state) ? "wallet" : "chain", error: event.error };
      if (!RECOVERABLE.includes(event.error)) return { ...state, step: "failed", error: event.error };
      // an expired quote must be asked for again; any other recoverable failure keeps the quote on screen
      return event.error === "quote-expired" ? { ...state, quote: null, step: "wallet", error: event.error } : { ...state, step: state.quote ? "quote" : "wallet", error: event.error };
    case "reset":
      return initialDeposit(state.network);
  }
}
