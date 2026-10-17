import type { DepositQuote } from "@strickle/arc/bridge/types";
import type { ArrivalClass } from "@strickle/brain";
import type { Action } from "@strickle/agent/signed";
import type { Address } from "viem";

const TWO_HOURS = 7_200;

/** "This deposit is my own money": the agent will not reserve taxes on an arrival of this size for two hours. The window is what the quote promises, an exact amount or a floor and the amount sent. */
export function expectAction(input: { quote: Pick<DepositQuote, "amountReceivedMin" | "amountSent">; id: string; from?: Address }): Extract<Action, { kind: "expect" }> {
  return {
    kind: "expect",
    id: input.id.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 12) || "deposit",
    asset: "USDC",
    min: input.quote.amountReceivedMin.toString(),
    max: input.quote.amountSent.toString(),
    expiresInSeconds: TWO_HOURS,
    ...(input.from ? { from: input.from } : {}),
  };
}

export function reclassifyAction(input: { arrivalId: string; to: ArrivalClass; learn?: Address }): Extract<Action, { kind: "reclassify" }> {
  return { kind: "reclassify", arrivalId: input.arrivalId, to: input.to, ...(input.learn ? { learn: input.learn } : {}) };
}
