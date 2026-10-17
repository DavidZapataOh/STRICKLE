import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { planArrivals } from "../enclave/arrivals.ts";
import type { Profile } from "../enclave/profile.ts";
import { profileOf } from "./support.ts";

const TODAY = plainDate(2026, 11, 10);
const ME = "0x00000000000000000000000000000000000000a1";
const X = "0x00000000000000000000000000000000000000b2";
const profile = (over: Partial<Profile> = {}): Profile => profileOf({ taxRateBps: 2_000, taxBufferBps: 10_500, ...over });
const books = { asset: "USDC" as const, unallocated: 0n, operating: 0n, payrollFunded: 0n, emergency: 0n };
const arrival = (amount: bigint, sender: string | null, id = "a1b2c3d4e5") => ({ id, asset: "USDC" as const, amount, sender, date: TODAY });
const plan = (arrivals: ReturnType<typeof arrival>[], over: { profile?: Profile; unexplained?: bigint } = {}) =>
  planArrivals({ profile: over.profile ?? profile(), books: { ...books, unallocated: arrivals.reduce((s, a) => s + a.amount, 0n) + (over.unexplained ?? 0n) }, arrivals, unexplained: over.unexplained ?? 0n, checkpoint: 777n, today: TODAY, now: 1_792_000_000 });
const total = (p: ReturnType<typeof plan>) => p.amounts.reduce((s, a) => s + a, 0n);
const taxes = (p: ReturnType<typeof plan>) => p.amounts[p.boxes.indexOf(1)] ?? 0n;

describe("an ordinary arrival", () => {
  it("is split as before: taxes reserved, history says deposit", () => {
    const p = plan([arrival(1_000_000_000n, "0x00000000000000000000000000000000000000c3")]);
    expect(total(p)).toBe(1_000_000_000n);
    expect(taxes(p)).toBe(210_000_000n); // 20% with the 5% buffer
    expect(p.next.history.at(-1)?.[2]).toBe("deposit");
    expect(p.notices).toEqual([]);
  });
});

describe("the user's own money", () => {
  const declared = profile({ flow: { checkpoint: "", owners: [], expect: [{ id: "e1", asset: "USDC", min: "490000000", max: "500000000", expiresAt: 1_792_003_600 }], sent: [] } });

  it("reserves no taxes on a declared deposit, still allocates all of it, and does not count it as income", () => {
    const p = plan([arrival(500_000_000n, ME)], { profile: declared });
    expect(total(p)).toBe(500_000_000n);
    expect(taxes(p)).toBe(0n);
    expect(p.next.history.at(-1)?.[2]).toBe("transfer");
    expect(p.next.flow.expect).toEqual([]);
    expect(p.next.arrivals.at(-1)).toEqual(["a1b2c3d4e5-0", "2026-11-10", "500000000", "o", "U"]);
  });

  it("reserves no taxes on money that came back from an address the vault paid", () => {
    const sentBefore = profile({ flow: { checkpoint: "", owners: [], expect: [], sent: [[X, "U", "300000000", "2026-11-07", "o"]] } });
    const p = plan([arrival(300_000_000n, X)], { profile: sentBefore });
    expect(taxes(p)).toBe(0n);
    expect(p.next.flow.sent).toEqual([]);
  });

  it("splits one arrival into a returned part and an income part, each handled by its own rule", () => {
    const sentBefore = profile({ flow: { checkpoint: "", owners: [], expect: [], sent: [[X, "U", "300000000", "2026-11-07", "o"]] } });
    const p = plan([arrival(450_000_000n, X)], { profile: sentBefore });
    expect(total(p)).toBe(450_000_000n);
    expect(taxes(p)).toBe(31_500_000n); // taxes only on the 150 that is income
    expect(p.next.arrivals.map((e) => e[3])).toEqual(["o", "i"]);
  });
});

describe("doubt", () => {
  it("splits as income and raises one notice for an address the user owns", () => {
    const owned = profile({ flow: { checkpoint: "", owners: [ME], expect: [], sent: [] } });
    const p = plan([arrival(500_000_000n, ME)], { profile: owned });
    expect(taxes(p)).toBe(105_000_000n);
    expect(p.notices).toEqual([{ kind: "income-doubt", arrivalId: "a1b2c3d4e5-0", asset: "USDC", amount: "500000000", flags: ["own-address"], sender: ME }]);
  });

  it("treats what no log explains as income with a notice that names no sender", () => {
    const p = plan([], { unexplained: 200_000_000n });
    expect(total(p)).toBe(200_000_000n);
    expect(taxes(p)).toBe(42_000_000n);
    expect(p.notices[0]).toMatchObject({ kind: "income-doubt", flags: ["unattributed"], sender: "" });
  });

  it("raises no notice for a plain income arrival from a stranger", () => {
    expect(plan([arrival(100_000_000n, X)]).notices).toEqual([]);
  });
});

describe("the tax catch-up", () => {
  it("is taken from the next income, on top of its own reserve, and is used up", () => {
    const owed = profile({ taxCatchUp: "50000000" });
    const p = plan([arrival(1_000_000_000n, X)], { profile: owed });
    expect(taxes(p)).toBe(260_000_000n);
    expect(p.next.taxCatchUp).toBe("0");
  });
  it("is never taken from money that is not income", () => {
    const owed = profile({ taxCatchUp: "50000000", flow: { checkpoint: "", owners: [], expect: [{ id: "e1", asset: "USDC", min: "1", max: "9999999999", expiresAt: 1_792_003_600 }], sent: [] } });
    expect(plan([arrival(500_000_000n, X)], { profile: owed }).next.taxCatchUp).toBe("50000000");
  });
});

describe("books and size", () => {
  it("moves the checkpoint to the block the arrivals were read up to", () => {
    expect(plan([arrival(100_000_000n, X)]).next.flow.checkpoint).toBe("777");
  });
  it("the allocation of two arrivals equals the allocation of their sum when both are income", () => {
    const one = plan([arrival(600_000_000n, X, "aaaaaaaaaa"), arrival(400_000_000n, X, "bbbbbbbbbb")]);
    const sum = plan([arrival(1_000_000_000n, X)]);
    const byBox = (p: ReturnType<typeof plan>) => Object.fromEntries(p.boxes.map((box, i) => [box, p.amounts[i]]));
    expect(byBox(one)).toEqual(byBox(sum));
  });
  it("keeps the ledger at forty entries, dropping the oldest", () => {
    let p = profile();
    for (let i = 0; i < 45; i++) p = planArrivals({ profile: p, books: { ...books, unallocated: 1_000_000n }, arrivals: [arrival(1_000_000n, X, `${String(i).padStart(10, "0")}`)], unexplained: 0n, checkpoint: BigInt(i), today: TODAY, now: 1_792_000_000 }).next;
    expect(p.arrivals).toHaveLength(40);
    expect(p.arrivals[0]?.[0]).toBe("0000000005-0");
  });
});
