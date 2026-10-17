import { type BoxKind, type PlainDate, type Rate, deviationBps, formatPlainDate, toUsdc } from "@strickle/core";
import type { Address, Hex } from "viem";
import type { SwapConfig } from "../config.ts";
import type { SwapReadout } from "./books.ts";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import { MAX_FAILURES, type SwapIntent, planSwap } from "./swap-plan.ts";
import { checkQuote, providerFeeBps, quoteBody } from "./swap-quote.ts";

type HeldReason = Extract<Notice, { kind: "swap-held" }>["reason"];
type BoxNotice = Extract<Notice, { kind: "swap-held" }>["box"];

export type Conversion =
  | { kind: "none"; next: Profile }
  | { kind: "held"; next: Profile; notices: Notice[] }
  | { kind: "swap"; intent: SwapIntent; data: Hex; gasLimit: bigint; seen: bigint; next: Profile; notices: Notice[]; failed: { next: Profile; notices: Notice[] } };

const QUOTE_REASON = { shape: "invalid-quote", beneficiary: "invalid-quote", token: "invalid-quote", deadline: "invalid-quote", "below-minimum": "worse-than-reference", "worse-than-reference": "worse-than-reference", "better-than-reference": "better-than-reference" } as const;

/** Circle's own gas estimate when it is larger than ours, but never more than twice ours: its figure is untrusted. */
const gasFor = (circle: bigint, config: SwapConfig): bigint => {
  const base = BigInt(config.gas);
  return circle > base ? (circle < base * 2n ? circle : base * 2n) : base;
};

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
export function convert(input: { allowed?: (intent: SwapIntent) => boolean; profile: Profile; vault: Address; swap: SwapReadout; today: PlainDate; now: number; config: SwapConfig; usdc: Address; eurc: Address; chain: "Arc_Testnet" | "Arc"; quote: (body: string) => unknown }): Conversion {
  const { swap, config, now } = input;
  const day = formatPlainDate(input.today);
  // three failures stop conversions for the rest of that day only: a Circle outage or a price move that passes must not switch the feature off for good
  const profile: Profile = input.profile.swap.failures > 0 && input.profile.swap.heldOn !== day ? { ...input.profile, swap: { ...input.profile.swap, failures: 0 } } : input.profile;
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
  const planned = planSwap({ profile, raw: swap.raw, rate, today: input.today, config, slippageBps: swap.slippageBps });
  if ("skip" in planned) {
    if (planned.skip === "halted" || planned.skip === "nothing-to-do") return none;
    const box = firstMisplaced(profile, swap.raw);
    return box === undefined ? none : quiet(hold(box, planned.skip === "failures" ? "failures" : "daily-cap"));
  }

  const approved = swap.adapter.address.toLowerCase() === config.adapter.toLowerCase() && swap.adapter.from !== 0n && BigInt(now) >= swap.adapter.from;
  if (!approved) {
    // a user who never declared euros did not ask for conversions: nothing to say about an adapter they never approved
    const declared = Object.values(profile.currencies).some((currency) => currency === "EUR");
    return declared ? quiet(hold(planned.boxKind, "adapter-not-approved")) : none;
  }
  if (input.allowed && !input.allowed(planned)) return none;

  const rateNow = { usdcUsd: rate.usdcUsd.toString(), eurcUsd: rate.eurcUsd.toString(), at: now };
  const failure = (reason: HeldReason): Conversion => {
    const failures = Math.min(9, profile.swap.failures + 1);
    // the failure that stops conversions for the day is always told, whatever was said before
    if (failures === MAX_FAILURES) return { kind: "held", next: { ...profile, rate: rateNow, swap: { ...profile.swap, failures, heldOn: day } }, notices: [{ kind: "swap-held", box: planned.boxKind as BoxNotice, reason: "failures" }] };
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
    const notice: Notice = {
    kind: "swap",
    box: planned.boxKind as BoxNotice,
    from: planned.assetIn,
    amountIn: planned.amountIn.toString(),
    estimatedOut: checked.estimated.toString(),
    minOut: planned.minOut.toString(),
    referenceOut: planned.expected.toString(),
    deviationBps: deviationBps(checked.estimated, planned.expected),
    feeBps: providerFeeBps(response, planned.amountIn),
  };
  // if the delivered report reverts on chain, the vault refused it under a limit the enclave cannot see (its floor, its own cap)
  const reverted = failure("vault-refused");
  const raw = planned.assetIn === "USDC" ? swap.raw.usdc : swap.raw.eurc;
  return { kind: "swap", intent: planned, data: checked.data, gasLimit: gasFor(checked.gasLimit, config), seen: raw[planned.boxKind], next, notices: [notice], failed: reverted.kind === "none" ? { next: profile, notices: [] } : { next: reverted.next, notices: reverted.kind === "held" ? reverted.notices : [] } };
}

