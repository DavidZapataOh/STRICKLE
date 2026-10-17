import type { TeeRuntime } from "@chainlink/cre-sdk";
import type { Address } from "viem";
import type { Config } from "../config.ts";
import { circleExplore } from "./earn-call.ts";
import { decodeHoldings, holdingsReads } from "./earn-reads.ts";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { exitIntents } from "./yield-plan.ts";
import { observe, watchStep } from "./yield-watch.ts";

const ONE_SHARE = 10n ** 18n;

/** Looks at the yield vaults an account holds, once per run: records what it sees and turns a vault that misbehaves into withdrawals of everything held there. An account that holds nothing costs no request. */
export function watchFor(runtime: TeeRuntime<Config>, input: { profile: Profile; vault: Address; nowSeconds: number }): { next: Profile; notices: Notice[] } {
  const unchanged = { next: input.profile, notices: [] };
  try {
    const vaults = runtime.config.earn.vaults;
    const answers = ethBatch(runtime, vaults.flatMap((entry) => holdingsReads(input.vault, entry.address as Address)));
    const held = vaults.map((entry, index) => ({ entry, ...decodeHoldings(answers.slice(index * 6, index * 6 + 6)) }));
    if (!held.some((row) => Object.keys(row.shares).length > 0)) return unchanged;

    const sharePrices = Object.fromEntries(held.map((row) => [row.entry.address.toLowerCase(), row.price]));
    const positions = Object.fromEntries(held.map((row) => [row.entry.address.toLowerCase(), (Object.values(row.shares).reduce((sum, shares) => sum + shares, 0n) * row.price) / ONE_SHARE]));
    let list: unknown = null;
    try {
      list = circleExplore(runtime, runtime.config.chainId === 5042 ? "ARC" : "ARC-TESTNET");
    } catch {
      // a list that is down is no observation this run; the chain's own share price still stands
    }
    const watched = watchStep({ profile: input.profile, now: observe({ vaults, sharePrices, list }), positions, nowSeconds: input.nowSeconds });
    const exits = exitIntents({
      profile: watched.next,
      anomalies: watched.anomalies,
      shares: Object.fromEntries(held.map((row) => [row.entry.address.toLowerCase(), row.shares])),
      vaults: Object.fromEntries(vaults.map((entry) => [entry.address.toLowerCase(), { address: entry.address, name: entry.name }])),
      now: input.nowSeconds,
    });
    return { next: exits.next, notices: exits.notices };
  } catch {
    return unchanged;
  }
}
