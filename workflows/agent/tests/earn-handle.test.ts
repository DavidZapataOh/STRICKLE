// workflows/agent/tests/earn-handle.test.ts
import { readFileSync } from "node:fs";
import { plainDate } from "@strickle/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Config } from "../config.ts";
import { type EarnReads, earnMove, expireStale, minOutFor } from "../enclave/earn-handle.ts";
import type { Profile } from "../enclave/profile.ts";
import { profileOf } from "./support.ts";

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/earn/${name}`, import.meta.url), "utf8"));
const VAULT = "0x00000000000000000000000000000000000000a1" as const;
const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const;
const ADAPTER = "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b" as const;
const USDC = "0x3600000000000000000000000000000000000000" as const;
const EURC = "0x89B50855Aa5E5cAc67BF7C074c23dce7A8b1BB4" as const;
const today = plainDate(2026, 11, 1);
const config = {
  swap: { adapter: ADAPTER, maxSlipBps: 100, gas: "1500000" },
  earn: { circleUrl: "https://api.circle.com", gas: "1500000", vaults: [{ address: EARN, name: "EarnKit USDC Vault", protocol: "Morpho" }] },
} as unknown as Config;
const NOW = Number(load("deposit.json").data.executionParams.deadline) - 600;
const WITHDRAW_NOW = Number(load("withdraw.json").data.executionParams.deadline) - 600;

const bundle = (name: string) => {
  const response = structuredClone(load(name));
  for (const entry of response.data.executionParams.tokens) entry.beneficiary = VAULT;
  return response;
};
const reads = (over: Partial<EarnReads> = {}): EarnReads => ({ approvedFrom: BigInt(NOW - 86_400), owned: 3_000_000_000_000_000_000n, box: 4_000_000_000n, adapter: { address: ADAPTER, from: BigInt(NOW - 86_400) }, slippageBps: 100, previewShares: 998_942_755_721_263_755n, position: 3_003_174n, ...over });
const pending = (over: Record<string, unknown> = {}) => ({ id: "i1", box: "profit" as const, vault: EARN, amount: "1000000", deposit: true, at: NOW - 60, ...over });
const withPending = (entries: ReturnType<typeof pending>[], over: Partial<Profile["earn"]> = {}): Profile => profileOf({ earn: { pending: entries, failures: 0, heldOn: "", ...over } });
const quoteOf = (calls: string[] = []) => (path: string): unknown => {
  calls.push(path);
  if (path === "/deposit/quote") return load("deposit-quote.json");
  if (path === "/deposit") return bundle("deposit.json");
  if (path === "/withdraw") return bundle("withdraw.json");
  throw new Error("unexpected path");
};
const move = (profile: Profile, over: Record<string, unknown> = {}) => earnMove({ profile, vault: VAULT, reads: reads(), today, now: NOW, config, usdc: USDC, chain: "ARC-TESTNET", quote: quoteOf(), ...over });

describe("a deposit", () => {
  it("asks Circle for the rate and the bundle, checks it and returns what to deliver", () => {
    const calls: string[] = [];
    const result = move(withPending([pending()]), { quote: quoteOf(calls) });
    if (result.kind !== "earn") throw new Error(result.kind);
    expect(calls).toEqual(["/deposit/quote", "/deposit"]);
    expect(result.deposit).toBe(true);
    expect(result.box).toBe(6);
    expect(result.amount).toBe(1_000_000n);
    expect(result.seen).toBe(4_000_000_000n);
    expect(result.minOut).toBe(minOutFor(998_942_755_721_263_755n, 100));
    expect(result.data.startsWith("0xaa3e079c")).toBe(true);
    expect(result.gas).toBe(1_500_000n);
    expect(result.next.earn.pending).toEqual([]);
    expect(result.notices).toEqual([{ kind: "earn", box: "profit", deposit: true, name: "EarnKit USDC Vault", protocol: "Morpho", vault: EARN, amount: "1000000", counter: "998942755721263755", apyBps: 420 }]);
  });

  it("still deposits when only the rate quote is down", () => {
    const quote = (path: string) => {
      if (path === "/deposit/quote") throw new Error("down");
      return quoteOf()(path);
    };
    const result = move(withPending([pending()]), { quote });
    if (result.kind !== "earn") throw new Error(result.kind);
    expect(result.notices[0]).toMatchObject({ kind: "earn", apyBps: 0 });
  });

  it("asks for a minimum no looser than the vault's own slippage setting", () => {
    const result = move(withPending([pending()]), { reads: reads({ slippageBps: 30 }) });
    if (result.kind !== "earn") throw new Error(result.kind);
    expect(result.minOut).toBe(minOutFor(998_942_755_721_263_755n, 30));
  });
});

describe("a withdrawal", () => {
  const out = pending({ deposit: false, amount: "1999999" });
  const outMove = (profile: Profile, over: Record<string, unknown> = {}) => move(profile, { now: WITHDRAW_NOW, ...over });

  it("asks only for the bundle, redeems the shares the bundle names and reports the dollars", () => {
    const calls: string[] = [];
    const result = outMove(withPending([out]), { quote: quoteOf(calls) });
    if (result.kind !== "earn") throw new Error(result.kind);
    expect(calls).toEqual(["/withdraw"]);
    expect(result.deposit).toBe(false);
    expect(result.amount).toBe(1_997_885_511_423_141_916n);
    expect(result.seen).toBe(3_000_000_000_000_000_000n);
    expect(result.minOut).toBeGreaterThan(1_900_000n);
    expect(result.notices).toEqual([{ kind: "earn", box: "profit", deposit: false, name: "EarnKit USDC Vault", protocol: "Morpho", vault: EARN, amount: "1999999", counter: "1997885511423141916", apyBps: 0 }]);
  });

  it("works without any vault approval, and takes everything when asked for more than the position", () => {
    const result = outMove(withPending([{ ...out, amount: "9999999999" }]), { reads: reads({ approvedFrom: 0n, owned: 1_997_885_511_423_141_916n, position: 1_999_999n }) });
    if (result.kind !== "earn") throw new Error(result.kind);
    expect(result.amount).toBe(1_997_885_511_423_141_916n);
  });

  it("is refused when the bundle redeems clearly more shares than the amount asked for", () => {
    const result = outMove(withPending([{ ...out, amount: "500000" }]));
    expect(result).toMatchObject({ kind: "held", notices: [{ kind: "earn-held", reason: "invalid-bundle" }] });
  });

  it("is refused when the bundle redeems far fewer shares than the amount asked for", () => {
    const tiny = bundle("withdraw.json");
    tiny.data.executionParams.instructions[0].amountToApprove = "1";
    tiny.data.executionParams.instructions[0].data = `${tiny.data.executionParams.instructions[0].data.slice(0, 10)}${"0".repeat(63)}1${tiny.data.executionParams.instructions[0].data.slice(74)}`;
    const result = outMove(withPending([out]), { quote: (path: string) => (path === "/withdraw" ? tiny : quoteOf()(path)) });
    expect(result).toMatchObject({ kind: "held", notices: [{ kind: "earn-held", reason: "invalid-bundle" }] });
  });

  it("reports what the shares are worth, not what was asked for", () => {
    const result = outMove(withPending([{ ...out, amount: "1999999" }]));
    if (result.kind !== "earn") throw new Error(result.kind);
    const notice = result.notices[0];
    expect(notice).toMatchObject({ kind: "earn", amount: ((3_003_174n * 1_997_885_511_423_141_916n) / 3_000_000_000_000_000_000n).toString() });
  });

  it("drops the request when the box owns no shares", () => {
    const result = outMove(withPending([out]), { reads: reads({ owned: 0n }) });
    expect(result).toMatchObject({ kind: "held", next: { earn: { pending: [] } }, notices: [{ kind: "earn-held", reason: "insufficient" }] });
  });
});

describe("what keeps a move from happening", () => {
  it("does nothing without a pending request, while halted, or when the brain does not allow it", () => {
    expect(move(profileOf()).kind).toBe("none");
    const halted = profileOf({ breaker: { halted: true, since: "2026-11-01", codes: ["user-pause"] }, earn: { pending: [pending()], failures: 0, heldOn: "" } });
    expect(move(halted).kind).toBe("none");
    expect(move(withPending([pending()]), { allowed: () => false }).kind).toBe("none");
  });

  it("waits, and says why once a day, when the adapter or the vault is not approved yet", () => {
    const early = BigInt(NOW + 3_600);
    const first = move(withPending([pending()]), { reads: reads({ adapter: { address: ADAPTER, from: early } }) });
    expect(first).toMatchObject({ kind: "held", next: { earn: { pending: [{ id: "i1" }], heldOn: "2026-11-01" } }, notices: [{ kind: "earn-held", reason: "adapter-not-approved" }] });
    const again = move(withPending([pending()], { heldOn: "2026-11-01" }), { reads: reads({ adapter: { address: ADAPTER, from: 0n } }) });
    expect(again.kind).toBe("none");
    expect(move(withPending([pending()]), { reads: reads({ approvedFrom: 0n }) })).toMatchObject({ notices: [{ reason: "vault-not-approved" }] });
    expect(move(withPending([pending()]), { reads: reads({ adapter: { address: EURC, from: BigInt(NOW - 1) } }) })).toMatchObject({ notices: [{ reason: "adapter-not-approved" }] });
  });

  it("drops a request for more than the box holds, an expired request and a vault that left the configuration", () => {
    expect(move(withPending([pending({ amount: "5000000000" })]))).toMatchObject({ kind: "held", next: { earn: { pending: [] } }, notices: [{ reason: "insufficient" }] });
    expect(move(withPending([pending({ at: NOW - 86_401 })]))).toMatchObject({ kind: "held", next: { earn: { pending: [] } }, notices: [{ reason: "expired" }] });
    expect(move(withPending([pending({ vault: "0x00000000000000000000000000000000000000d9" })]))).toMatchObject({ kind: "held", next: { earn: { pending: [] } }, notices: [{ reason: "vault-not-approved" }] });
  });

  it("acts on the oldest request first and leaves the others for the next run", () => {
    const result = move(withPending([pending(), pending({ id: "i2", box: "taxes", at: NOW - 30 })]));
    if (result.kind !== "earn") throw new Error(result.kind);
    expect(result.next.earn.pending.map((entry) => entry.id)).toEqual(["i2"]);
  });
});

describe("Circle's answer is not trusted", () => {
  const failing = (quote: (path: string) => unknown) => move(withPending([pending()]), { quote });

  it("counts a failed call and a refused bundle, keeps the request, and says so once", () => {
    const down = failing(() => {
      throw new Error("down");
    });
    expect(down).toMatchObject({ kind: "held", next: { earn: { failures: 1, pending: [{ id: "i1" }] } }, notices: [{ kind: "earn-held", reason: "quote-unavailable" }] });
    const target = bundle("deposit.json");
    target.data.executionParams.instructions[0].target = "0x00000000000000000000000000000000000000d9";
    const refused = failing((path) => (path === "/deposit" ? target : load("deposit-quote.json")));
    expect(refused).toMatchObject({ notices: [{ reason: "invalid-bundle" }], next: { earn: { failures: 1 } } });
  });

  it("stops after the third failure, clears the requests and tells the owner", () => {
    const profile = withPending([pending()], { failures: 2 });
    const result = move(profile, {
      quote: () => {
        throw new Error("down");
      },
    });
    expect(result).toMatchObject({ kind: "held", next: { earn: { failures: 3, pending: [] } }, notices: [{ reason: "failures" }] });
  });

  it("returns the failed state for a report the vault itself refuses", () => {
    const result = move(withPending([pending()]));
    if (result.kind !== "earn") throw new Error(result.kind);
    expect(result.failed.next.earn).toMatchObject({ failures: 1, pending: [{ id: "i1" }] });
    expect(result.failed.notices).toEqual([{ kind: "earn-held", box: "profit", deposit: true, name: "EarnKit USDC Vault", reason: "vault-refused" }]);
  });
});

describe("the minimum", () => {
  it("is never below what the vault would accept at its own slippage", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 30n }), fc.integer({ min: 10, max: 100 }), (preview, slippage) => {
        const vaultFloor = (preview * BigInt(10_000 - slippage) + 9_999n) / 10_000n;
        expect(minOutFor(preview, slippage)).toBeGreaterThanOrEqual(vaultFloor);
        expect(minOutFor(preview, slippage)).toBeLessThanOrEqual(preview);
      }),
    );
  });
});

describe("a request that could never be read", () => {
  it("expires after a day even when the reads that would have carried it out keep failing", () => {
    const old = withPending([pending({ at: NOW - 86_401 }), pending({ id: "i2", box: "taxes", at: NOW - 10 })]);
    expect(expireStale({ profile: old, config, now: NOW })).toMatchObject({ kind: "held", next: { earn: { pending: [{ id: "i2" }] } }, notices: [{ kind: "earn-held", reason: "expired", box: "profit", name: "EarnKit USDC Vault" }] });
  });

  it("leaves a young request, an empty list and a halted profile alone", () => {
    expect(expireStale({ profile: withPending([pending()]), config, now: NOW })).toBeUndefined();
    expect(expireStale({ profile: profileOf(), config, now: NOW })).toBeUndefined();
  });
});
