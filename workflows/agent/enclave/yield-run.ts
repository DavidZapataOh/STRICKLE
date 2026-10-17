import type { TeeRuntime } from "@chainlink/cre-sdk";
import { type BoxKind, type PlainDate, formatPlainDate } from "@strickle/core";
import type { VaultView } from "@strickle/brain";
import type { Address } from "viem";
import type { Config } from "../config.ts";
import { circleExplore } from "./earn-call.ts";
import { decodeHoldings, decodeRules, holdingsReads, rulesReads } from "./earn-reads.ts";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { exitIntents } from "./yield-plan.ts";
import { inviteDue, inviteStep } from "./yield-invite.ts";
import { yieldIntents } from "./yield-policy.ts";
import { observe, watchStep } from "./yield-watch.ts";

const ONE_SHARE = 10n ** 18n;

/**
 * What the agent does about yield for one account in one run, read and decided in batches of their own so a vault or a service that cannot answer costs this look and never the tick:
 * it looks at the vaults the account holds (a vault that misbehaves becomes withdrawals of everything held there), brings back money a payment will need, and, for an account
 * that switched yield on, puts to work what no box needs in the next 60 days. An account that holds nothing and has yield off costs no request.
 */
export function yieldRun(runtime: TeeRuntime<Config>, input: { profile: Profile; vault: Address; usdc: Record<BoxKind, bigint>; invested: Record<BoxKind, bigint>; today: PlainDate; nowSeconds: number }): { next: Profile; notices: Notice[] } {
  const unchanged = { next: input.profile, notices: [] };
  try {
    const vaults = runtime.config.earn.vaults;
    const answers = ethBatch(runtime, vaults.flatMap((entry) => holdingsReads(input.vault, entry.address as Address)));
    const held = vaults.map((entry, index) => ({ entry, ...decodeHoldings(answers.slice(index * 6, index * 6 + 6)) }));
    const holds = held.some((row) => Object.keys(row.shares).length > 0);
    const day = formatPlainDate(input.today);
    if (!holds && !input.profile.yield.enabled && !inviteDue(input.profile, input.today)) return unchanged;
    // an account that holds nothing is looked at once a day: only the holdings read above runs every time
    if (!holds && input.profile.yield.enabled && input.profile.yield.day === day) return unchanged;

    const sharePrices = Object.fromEntries(held.map((row) => [row.entry.address.toLowerCase(), row.price]));
    const positions = Object.fromEntries(held.map((row) => [row.entry.address.toLowerCase(), (Object.values(row.shares).reduce((sum, shares) => sum + shares, 0n) * row.price) / ONE_SHARE]));
    let list: unknown = null;
    try {
      list = circleExplore(runtime, runtime.config.chainId === 5042 ? "ARC" : "ARC-TESTNET");
    } catch {
      // a list that is down is no observation this run; the chain's own share price still stands
    }
    // the watch can judge a vault by the chain's price alone; allocation needs what the list says about it
    const stored = input.profile.yieldWatch.vaults;
    const watching = observe({ vaults, sharePrices, list, stored });
    const seen = observe({ vaults, sharePrices, list });
    const watched = watchStep({ profile: input.profile, now: watching, positions, nowSeconds: input.nowSeconds });
    const exits = exitIntents({
      profile: watched.next,
      anomalies: watched.anomalies,
      shares: Object.fromEntries(held.map((row) => [row.entry.address.toLowerCase(), row.shares])),
      vaults: Object.fromEntries(vaults.map((entry) => [entry.address.toLowerCase(), { address: entry.address, name: entry.name }])),
      now: input.nowSeconds,
      day,
    });

    // the one invitation for an account that has yield off, quoting the best rate among the vaults that are open and were not flagged
    const open = seen.filter((entry) => entry.active && !watched.anomalies.some((flagged) => flagged.id === entry.id));
    const invited = inviteStep({ profile: exits.next, today: input.today, apyBps: open.length > 0 ? Math.max(...open.map((entry) => entry.apyBps)) : null });

    // a vault that was just flagged gets no new money, and a vault the list did not carry cannot be judged
    const flagged = new Set(watched.anomalies.map((entry) => entry.id));
    const views: VaultView[] = seen.filter((entry) => !flagged.has(entry.id)).map((entry) => ({ id: entry.id, protocol: vaults.find((candidate) => candidate.address.toLowerCase() === entry.id)?.protocol ?? "", apyBps: entry.apyBps, active: entry.active, liquidity: entry.liquidity }));
    const rules = decodeRules(ethBatch(runtime, rulesReads(input.vault)));
    const holdings = Object.fromEntries(held.map((row) => [row.entry.address.toLowerCase(), Object.fromEntries(Object.entries(row.shares).map(([box, shares]) => [box, (shares * row.price) / ONE_SHARE]))]));
    const decided = yieldIntents({ profile: invited.next, usdc: input.usdc, invested: input.invested, rules, holdings, views, vaults, today: input.today, now: input.nowSeconds, limits: runtime.config.earn.limits });
    return { next: decided.next, notices: [...exits.notices, ...invited.notices, ...decided.notices] };
  } catch {
    return unchanged;
  }
}
