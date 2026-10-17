import { type BoxKind, type PlainDate, type Rate, deviationBps, formatPlainDate, toUsdc } from "@strickle/core";
import type { Address, Hex } from "viem";
import type { SwapConfig } from "../config.ts";
import type { SwapReadout } from "./books.ts";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import { type SwapIntent, planSwap } from "./swap-plan.ts";
import { checkQuote, quoteBody } from "./swap-quote.ts";

type HeldReason = Extract<Notice, { kind: "swap-held" }>["reason"];
type BoxNotice = Extract<Notice, { kind: "swap-held" }>["box"];

export type Conversion =
  | { kind: "none"; next: Profile }
  | { kind: "held"; next: Profile; notices: Notice[] }
  | { kind: "swap"; intent: SwapIntent; data: Hex; gasLimit: bigint; seen: bigint; next: Profile; notices: Notice[]; failed: { next: Profile; notices: Notice[] } };

const QUOTE_REASON = { shape: "invalid-quote", beneficiary: "invalid-quote", token: "invalid-quote", deadline: "invalid-quote", "below-minimum": "worse-than-reference", "worse-than-reference": "worse-than-reference", "better-than-reference": "better-than-reference" } as const;

/** The first box, in the planner's order, that holds money in the wrong asset; used to name a box when no rate is available to plan with. */
function firstMisplaced(profile: Profile, raw: SwapReadout["raw"]): BoxKind | undefined {
  const order: BoxKind[] = ["payroll", "operating", "emergency", "profit", "taxes", "salary"];
  return order.find((kind) => {
    const wantsEuros = (kind === "payroll" || kind === "operating" || kind === "emergency" || kind === "profit") && profile.currencies[kind] === "EUR";
    return (wantsEuros ? raw.usdc[kind] : raw.eurc[kind]) > 0n;
  });
}

/**
 * One conversion for one vault: decide, ask Circle, check the answer, and return what to deliver. Circle's answer is untrusted, so
 * every outcome that is not a fully checked quote keeps the vault working in the asset it holds and costs at most one counted failure.
 */
export function convert(input: { profile: Profile; vault: Address; swap: SwapReadout; today: PlainDate; now: number; config: SwapConfig; usdc: Address; eurc: Address; chain: "Arc_Testnet" | "Arc"; quote: (body: string) => unknown }): Conversion {
  const { profile, swap, config, now } = input;
  const day = formatPlainDate(input.today);
  const none: Conversion = { kind: "none", next: profile };
  const hold = (box: BoxKind, reason: HeldReason, patch: Partial<Profile["swap"]> = {}): Conversion => {
    const settled: Profile = { ...profile, swap: { ...profile.swap, ...patch } };
    if (profile.swap.heldOn === day) return { kind: "held", next: settled, notices: [] };
    return { kind: "held", next: { ...settled, swap: { ...settled.swap, heldOn: day } }, notices: [{ kind: "swap-held", box: box as BoxNotice, reason }] };
  };
  // a held reason that is already told today and changes nothing is not a state change worth a report
  const quiet = (result: Conversion): Conversion => (result.kind === "held" && result.notices.length === 0 && JSON.stringify(result.next) === JSON.stringify(profile) ? none : result);

  if (swap.rate === "stale") {
    const box = firstMisplaced(profile, swap.raw);
    return box === undefined ? none : quiet(hold(box, "stale-feed"));
  }
  const rate: Rate = swap.rate;
  const planned = planSwap({ profile, raw: swap.raw, rate, today: input.today, config });
  if ("skip" in planned) {
    if (planned.skip === "halted" || planned.skip === "nothing-to-do") return none;
    const box = firstMisplaced(profile, swap.raw);
    return box === undefined ? none : quiet(hold(box, planned.skip === "failures" ? "failures" : "daily-cap"));
  }

  const approved = swap.adapter.address.toLowerCase() === config.adapter.toLowerCase() && swap.adapter.from !== 0n && BigInt(now) >= swap.adapter.from;
  if (!approved) return quiet(hold(planned.boxKind, "adapter-not-approved"));

  const rateNow = { usdcUsd: rate.usdcUsd.toString(), eurcUsd: rate.eurcUsd.toString(), at: now };
  const failure = (reason: HeldReason): Conversion => {
    const failures = Math.min(9, profile.swap.failures + 1);
    const told = hold(planned.boxKind, reason, { failures });
    return told.kind === "held" ? { ...told, next: { ...told.next, rate: rateNow } } : told;
  };

  let response: unknown;
  try {
    response = input.quote(quoteBody({ vault: input.vault, intent: planned, chain: input.chain, usdc: input.usdc, eurc: input.eurc }));
  } catch {
    return failure("quote-unavailable");
  }
  const checked = checkQuote({ response, vault: input.vault, intent: planned, rate, now, config, usdc: input.usdc, eurc: input.eurc });
  if (!checked.ok) return failure(QUOTE_REASON[checked.reason]);

  const spentToday = profile.swap.day === day ? BigInt(profile.swap.spent) : 0n;
  const next: Profile = { ...profile, rate: rateNow, swap: { ...profile.swap, day, spent: (spentToday + toUsdc(planned.assetIn, planned.amountIn, rate)).toString(), failures: 0 } };
  const fee = BigInt((response as { fees?: { provider?: { amount?: string }[] } }).fees?.provider?.[0]?.amount ?? "0");
  const notice: Notice = {
    kind: "swap",
    box: planned.boxKind as BoxNotice,
    from: planned.assetIn,
    amountIn: planned.amountIn.toString(),
    estimatedOut: checked.estimated.toString(),
    minOut: planned.minOut.toString(),
    referenceOut: planned.expected.toString(),
    deviationBps: deviationBps(checked.estimated, planned.expected),
    feeBps: Number((fee * 10_000n) / planned.amountIn),
  };
  // if the delivered report reverts on chain, the most likely cause is an adapter or price condition the vault checks and the enclave cannot see
  const reverted = failure("adapter-not-approved");
  const raw = planned.assetIn === "USDC" ? swap.raw.usdc : swap.raw.eurc;
  return { kind: "swap", intent: planned, data: checked.data, gasLimit: checked.gasLimit > BigInt(config.gas) ? checked.gasLimit : BigInt(config.gas), seen: raw[planned.boxKind], next, notices: [notice], failed: reverted.kind === "none" ? { next: profile, notices: [] } : { next: reverted.next, notices: reverted.kind === "held" ? reverted.notices : [] } };
}

