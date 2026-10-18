import { DEFAULT_LIMITS, INVEST_HORIZON_DAYS, type Obligation, REDEEM_LEAD_BUSINESS_DAYS, type RiskLimits, TAXES_MAX_BPS, type VaultView, businessDaysBefore, investableNow, planAllocation, redemptionsDue } from "@strickle/brain";
import { type BoxKind, type PlainDate, addDays, daysBetween, formatPlainDate, parsePlainDate } from "@strickle/core";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import { isWholeExit } from "./yield-plan.ts";

type Box = Profile["earn"]["pending"][number]["box"];
/** The boxes that may be put to work, in the order the agent looks at them; the salary box is paid every month and stays liquid. */
const BOXES: readonly Box[] = ["taxes", "payroll", "operating", "emergency", "profit"];
/** Below this an automatic move is not worth its gas. */
export const MIN_AUTO_UNITS = 10_000_000n;
/** Five places, as for exits: an exit for every box always fits. */
const MAX_PENDING = 5;
/** A payment that slipped by less than this is still counted; nothing in the profile marks a payment as settled, so older dates are taken as done. */
const GRACE_DAYS = 7;

/** What the account will have to pay out of a box that the agent can see coming: the payrolls from today on and the next tax date with what is owed. */
export function obligationsOf(profile: Profile, today: PlainDate): Obligation[] {
  const from = formatPlainDate(addDays(today, -GRACE_DAYS));
  const payrolls = profile.payrolls.filter(([date]) => date >= from).map(([date, amount]): Obligation => ({ box: "payroll", due: parsePlainDate(date), amount: BigInt(amount) }));
  const nextTax = [...profile.taxDates].filter((date) => date >= from).sort()[0];
  const taxes: Obligation[] = nextTax !== undefined && BigInt(profile.taxesDue) > 0n ? [{ box: "taxes", due: parsePlainDate(nextTax), amount: BigInt(profile.taxesDue) }] : [];
  return [...payrolls, ...taxes];
}

export interface PolicyInput {
  profile: Profile;
  /** The cash each box holds in USDC and the principal it has in vaults. */
  usdc: Record<BoxKind, bigint>;
  invested: Record<BoxKind, bigint>;
  /** What the vault itself lets the agent do with each box: the share it may put to work and the floor it must keep. */
  rules: Record<Box, { maxInvestBps: number; floor: bigint }>;
  /** What each box holds in each yield vault, in assets, by lower-case vault address. */
  holdings: Record<string, Partial<Record<Box, bigint>>>;
  views: readonly VaultView[];
  vaults: readonly { address: string; name: string; protocol: string }[];
  today: PlainDate;
  now: number;
  limits?: RiskLimits;
}

/**
 * The agent's own requests, carried out by the same pipeline as the owner's: money a payment needs in the next five business days comes back first and always,
 * then, once a day and only for an account that switched yield on, money no box needs in the next 60 days is put to work, spread over the vaults inside the limits.
 */
export function yieldIntents(input: PolicyInput): { next: Profile; notices: Notice[] } {
  const { profile, today } = input;
  const notices: Notice[] = [];
  if (profile.breaker.halted) return { next: profile, notices };
  const day = formatPlainDate(today);
  const obligations = obligationsOf(profile, today);
  let pending = [...profile.earn.pending];
  let serial = 0;
  const id = (box: Box) => `a${input.now.toString(36)}${box.slice(0, 2)}${serial++}`;
  const same = (entry: (typeof pending)[number], box: Box, vault: string) => entry.box === box && entry.vault.toLowerCase() === vault.toLowerCase();

  for (const box of BOXES) {
    const working = input.invested[box];
    if (working <= 0n) continue;
    const worth = input.vaults.reduce((sum, vault) => sum + (input.holdings[vault.address.toLowerCase()]?.[box] ?? 0n), 0n);
    const amount = redemptionsDue({ box, liquid: input.usdc[box], invested: working, worth, obligations, today });
    const holder = input.vaults.find((vault) => (input.holdings[vault.address.toLowerCase()]?.[box] ?? 0n) > 0n);
    if (amount <= 0n || !holder) continue;
    // a withdrawal already waiting for this box that covers the shortfall is enough; a smaller one is replaced by this one
    const covering = pending.find((entry) => same(entry, box, holder.address) && !entry.deposit && (isWholeExit(entry) || BigInt(entry.amount) >= amount));
    if (covering) continue;
    pending = pending.filter((entry) => !(same(entry, box, holder.address) && !entry.deposit));
    // the money is needed, so the agent's own deposit waiting for this box makes no sense any more; the owner's stays
    pending = pending.filter((entry) => !(entry.box === box && entry.deposit && entry.auto === true));
    while (pending.length >= MAX_PENDING) {
      const room = [...pending].filter((entry) => entry.deposit).sort((a, b) => a.at - b.at)[0];
      if (!room) break;
      pending = pending.filter((entry) => entry !== room);
    }
    if (pending.length >= MAX_PENDING) continue;
    pending.push({ id: id(box), box, vault: holder.address, amount: amount.toString(), deposit: false, at: input.now, auto: true });
    const inWindow = obligations.filter((entry) => entry.box === box && daysBetween(today, businessDaysBefore(entry.due, REDEEM_LEAD_BUSINESS_DAYS)) <= 0).sort((a, b) => daysBetween(b.due, a.due));
    notices.push({ kind: "yield-back", box, amount: amount.toString(), payment: inWindow.reduce((sum, entry) => sum + entry.amount, 0n).toString(), due: formatPlainDate((inWindow[0] as Obligation).due) });
  }

  let state = profile.yield;
  if (profile.yield.enabled && profile.yield.day !== day) {
    state = { ...profile.yield, day };
    const held = Object.fromEntries(input.vaults.map((vault) => [vault.address.toLowerCase(), Object.values(input.holdings[vault.address.toLowerCase()] ?? {}).reduce((sum, value) => sum + value, 0n)]));
    for (const box of BOXES) {
      if (pending.some((entry) => entry.box === box)) continue;
      const rule = input.rules[box];
      // the taxes box is never more than half invested, whatever the vault would allow
      const share = box === "taxes" ? Math.min(rule.maxInvestBps, TAXES_MAX_BPS) : rule.maxInvestBps;
      const budget = investableNow({ box, liquid: input.usdc[box], invested: input.invested[box], floor: rule.floor, obligations, today, maxInvestBps: share });
      if (budget < MIN_AUTO_UNITS) continue;
      let moved = 0n;
      for (const move of planAllocation({ budget, held, vaults: input.views, limits: input.limits ?? DEFAULT_LIMITS }).moves) {
        const vault = input.vaults.find((entry) => entry.address.toLowerCase() === move.vault);
        if (!vault || move.amount < MIN_AUTO_UNITS || pending.length >= MAX_PENDING) continue;
        pending.push({ id: id(box), box, vault: vault.address, amount: move.amount.toString(), deposit: true, at: input.now, auto: true });
        held[move.vault] = (held[move.vault] ?? 0n) + move.amount;
        moved += move.amount;
      }
      if (moved > 0n) {
        const needed = obligations.filter((entry) => entry.box === box && daysBetween(today, entry.due) <= INVEST_HORIZON_DAYS).reduce((sum, entry) => sum + entry.amount, 0n);
        notices.push({ kind: "yield-plan", box, amount: moved.toString(), kept: (input.usdc[box] - moved).toString(), needed: needed.toString() });
      }
    }
  }
  return { next: { ...profile, earn: { ...profile.earn, pending }, yield: state }, notices };
}
