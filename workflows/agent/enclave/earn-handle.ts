import { type PlainDate, formatPlainDate } from "@strickle/core";
import type { Address, Hex } from "viem";
import type { Config } from "../config.ts";
import { BOX_ID } from "./cascade.ts";
import { checkEarnBundle, earnBody, parseEarnQuote } from "./earn-quote.ts";
import { gainOf, yieldFee } from "@strickle/brain";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import { MAX_FAILURES } from "./swap-plan.ts";

/** An owner's request waits this long for a tick that can carry it out before it is dropped. */
export const EARN_REQUEST_SECONDS = 86_400;

/** What one move needs from one vault, read in a batch of its own: the approvals, the box's money and shares, the vault's slippage setting and its own two previews. */
export interface EarnReads {
  /** What the box put into yield vaults, in assets: the principal a withdrawal's gain is measured against. */
  invested: bigint;
  approvedFrom: bigint;
  owned: bigint;
  box: bigint;
  adapter: { address: Address; from: bigint };
  slippageBps: number;
  /** The yield vault's preview of the shares a deposit of the request gets. */
  previewShares: bigint;
  /** The yield vault's preview of what all the shares the box owns are worth. */
  position: bigint;
}

type Pending = Profile["earn"]["pending"][number];
type HeldReason = Extract<Notice, { kind: "earn-held" }>["reason"];

export type EarnOutcome =
  | { kind: "none"; next: Profile }
  | { kind: "held"; next: Profile; notices: Notice[] }
  | { kind: "earn"; deposit: boolean; box: number; earnVault: Address; amount: bigint; minOut: bigint; seen: bigint; data: Hex; gas: bigint; next: Profile; notices: Notice[]; failed: { next: Profile; notices: Notice[] } };

/** The least the vault will accept: the preview less the vault's own slippage, rounded up the way the vault rounds it, so it is never looser than the vault's floor. */
export const minOutFor = (preview: bigint, slippageBps: number): bigint => (preview * BigInt(10_000 - slippageBps) + 9_999n) / 10_000n;

/** The oldest request, dropped with a told reason when it is past its day: the reads that would have carried it out may be failing for good, and it must not wait for ever or block new requests. */
export function expireStale(input: { profile: Profile; config: Config; now: number }): EarnOutcome | undefined {
  const intent = [...input.profile.earn.pending].sort((a, b) => a.at - b.at)[0];
  if (!intent || input.now - intent.at <= EARN_REQUEST_SECONDS) return undefined;
  const name = input.config.earn.vaults.find((entry) => entry.address.toLowerCase() === intent.vault.toLowerCase())?.name ?? "";
  const rest = input.profile.earn.pending.filter((entry) => entry !== intent);
  return { kind: "held", next: { ...input.profile, earn: { ...input.profile.earn, pending: rest } }, notices: [{ kind: "earn-held", box: intent.box, deposit: intent.deposit, name, reason: "expired" }] };
}

/**
 * One move for one vault: take the owner's oldest request, ask Circle for the bundle, check it and return what to deliver. Circle's answer is
 * untrusted, so every outcome that is not a fully checked bundle keeps the money where it is and costs at most one counted failure.
 */
export function earnMove(input: { profile: Profile; vault: Address; reads: EarnReads; today: PlainDate; now: number; config: Config; usdc: Address; chain: "ARC-TESTNET" | "ARC"; quote: (path: string, body: string) => unknown; allowed?: (move: { deposit: boolean; box: Pending["box"]; amount: bigint }) => boolean }): EarnOutcome {
  const { profile, reads, config, now } = input;
  const none: EarnOutcome = { kind: "none", next: profile };
  if (profile.breaker.halted) return none;
  const intent = [...profile.earn.pending].sort((a, b) => a.at - b.at)[0];
  if (!intent) return none;

  const day = formatPlainDate(input.today);
  const known = config.earn.vaults.find((entry) => entry.address.toLowerCase() === intent.vault.toLowerCase());
  const name = known?.name ?? "";
  const earnVault = intent.vault as Address;
  const without = (pending: Pending[]): Profile => ({ ...profile, earn: { ...profile.earn, pending } });
  const rest = profile.earn.pending.filter((entry) => entry !== intent);
  const held = (reason: HeldReason): Notice => ({ kind: "earn-held", box: intent.box, deposit: intent.deposit, name, reason });
  // a request that cannot be carried out is told once and forgotten
  const drop = (reason: HeldReason): EarnOutcome => ({ kind: "held", next: without(rest), notices: [held(reason)] });
  // a wait that is already told today and changes nothing is not a state change worth a report
  const hold = (reason: HeldReason, patch: Partial<Profile["earn"]> = {}): EarnOutcome => {
    const settled: Profile = { ...profile, earn: { ...profile.earn, ...patch } };
    if (profile.earn.heldOn === day) return JSON.stringify(settled) === JSON.stringify(profile) ? none : { kind: "held", next: settled, notices: [] };
    return { kind: "held", next: { ...settled, earn: { ...settled.earn, heldOn: day } }, notices: [held(reason)] };
  };
  const failure = (reason: HeldReason): EarnOutcome => {
    const failures = Math.min(9, profile.earn.failures + 1);
    // the failure that stops the moves is always told, and the requests that kept failing go with it
    if (failures === MAX_FAILURES) return { kind: "held", next: { ...profile, earn: { pending: [], failures, heldOn: day } }, notices: [held("failures")] };
    return hold(reason, { failures });
  };

  if (!known) return drop("vault-not-approved");
  if (now - intent.at > EARN_REQUEST_SECONDS) return drop("expired");
  const adapter = reads.adapter.address.toLowerCase() === config.swap.adapter.toLowerCase() && reads.adapter.from !== 0n && BigInt(now) >= reads.adapter.from;
  if (!adapter) return hold("adapter-not-approved");
  // taking money out needs no approval of the vault: revoking one never traps what is already inside
  if (intent.deposit && (reads.approvedFrom === 0n || BigInt(now) < reads.approvedFrom)) return hold("vault-not-approved");

  const asked = BigInt(intent.amount);
  const assets = intent.deposit ? asked : asked < reads.position ? asked : reads.position;
  if (intent.deposit ? asked > reads.box : reads.owned === 0n || reads.position === 0n) return drop("insufficient");
  // the shares this request should cost, from the vault's own preview; the bundle may differ a little but never by much
  const shares = intent.deposit ? 0n : assets >= reads.position ? reads.owned : (assets * reads.owned + reads.position - 1n) / reads.position;
  if (input.allowed && !input.allowed({ deposit: intent.deposit, box: intent.box, amount: assets })) return none;

  const body = earnBody({ vault: input.vault, earnVault, assets, chain: input.chain });
  let apyBps = 0;
  let response: unknown;
  try {
    if (intent.deposit) {
      try {
        apyBps = parseEarnQuote(input.quote("/deposit/quote", body)).apyBps;
      } catch {
        // the rate is only shown to the person: a quote that is down must not stop a deposit
      }
    }
    response = input.quote(intent.deposit ? "/deposit" : "/withdraw", body);
  } catch {
    return failure("quote-unavailable");
  }
  const checked = checkEarnBundle({ response, vault: input.vault, earnVault, adapter: config.swap.adapter as Address, usdc: input.usdc, deposit: intent.deposit, assets: asked, ownedShares: reads.owned, now });
  if (!checked.ok) return failure("invalid-bundle");
  // the bundle may differ a little from the preview, never by much either way: a withdrawal of almost nothing is not the one that was asked for
  if (!intent.deposit && (checked.amount > (shares * 101n) / 100n + 1n || checked.amount < (shares * 99n) / 100n)) return failure("invalid-bundle");

  const slippage = Math.min(config.swap.maxSlipBps, reads.slippageBps);
  const worth = intent.deposit ? reads.previewShares : (reads.position * checked.amount + reads.owned - 1n) / reads.owned + 1n;
  const valueOut = intent.deposit ? 0n : (reads.position * checked.amount) / reads.owned;
  // the vault settles a partial withdrawal against the same share of the principal, so the gain is what the shares are worth above that share
  const gain = intent.deposit ? 0n : gainOf(valueOut, (reads.invested * checked.amount) / reads.owned);
  const fee = yieldFee(gain).fee;
  const totals = intent.deposit ? profile.yield : { ...profile.yield, realized: (BigInt(profile.yield.realized) + gain).toString(), fee: (BigInt(profile.yield.fee) + fee).toString() };
  const next: Profile = { ...without(rest), earn: { ...profile.earn, pending: rest, failures: 0 }, yield: totals };
  const notice: Notice = { kind: "earn", box: intent.box, deposit: intent.deposit, name, protocol: known.protocol, vault: earnVault, amount: (intent.deposit ? assets : valueOut).toString(), counter: (intent.deposit ? reads.previewShares : checked.amount).toString(), apyBps, ...(intent.deposit ? {} : { gain: gain.toString(), fee: fee.toString() }) };
  // if the delivered report reverts on chain, the vault refused it under a limit the enclave cannot see (the box's floor, its invest share)
  const reverted = failure("vault-refused");
  return {
    kind: "earn",
    deposit: intent.deposit,
    box: BOX_ID[intent.box],
    earnVault,
    amount: checked.amount,
    minOut: minOutFor(worth, slippage),
    seen: intent.deposit ? reads.box : reads.owned,
    data: checked.data,
    gas: BigInt(config.earn.gas),
    next,
    notices: [notice],
    failed: reverted.kind === "none" ? { next: profile, notices: [] } : { next: reverted.next, notices: reverted.kind === "held" ? reverted.notices : [] },
  };
}
