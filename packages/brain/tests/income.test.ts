import { describe, expect, it } from "vitest";
import { type Sent, classifyArrival } from "../src/income.ts";
import { CASES, baseContext } from "./income-cases.ts";

describe("the golden table", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const { parts } = classifyArrival(c.arrival, baseContext(c.context));
    expect(parts.map((p) => ({ amount: p.amount, class: p.class, basis: p.basis, flags: p.flags }))).toEqual(c.parts);
  });
});

describe("the books after an arrival", () => {
  it("consumes a declaration once, so a second similar deposit stays income", () => {
    const first = CASES.find((c) => c.name.startsWith("3 "))!;
    const context = baseContext(first.context);
    const once = classifyArrival(first.arrival, context);
    expect(once.expectations).toEqual([]);
    const again = classifyArrival(first.arrival, { ...context, expectations: once.expectations });
    expect(again.parts[0]?.class).toBe("income");
  });

  it("reduces an outflow by what came back and drops it when it is all back", () => {
    const partial = CASES.find((c) => c.name.startsWith("10 "))!;
    const done = classifyArrival(partial.arrival, baseContext(partial.context));
    expect(done.sent).toHaveLength(1);
    expect(done.sent[0]?.amount).toBe(200_000_000n);
    const whole = CASES.find((c) => c.name.startsWith("8 "))!;
    expect(classifyArrival(whole.arrival, baseContext(whole.context)).sent).toEqual([]);
  });

  it("drops outflows older than the retention window", () => {
    const old = CASES.find((c) => c.name.startsWith("11 "))!;
    const context = baseContext({ ...old.context, sent: [...(old.context.sent ?? []), { ...(old.context.sent?.[0] as Sent), date: { year: 2025, month: 1, day: 1 } as never }] });
    expect(classifyArrival(old.arrival, context).sent).toHaveLength(1);
  });

  it("does not mutate what it was given", () => {
    const c = CASES.find((entry) => entry.name.startsWith("15 "))!;
    const context = baseContext(c.context);
    const before = JSON.stringify(context, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    classifyArrival(c.arrival, context);
    expect(JSON.stringify(context, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).toBe(before);
  });
});

describe("properties over many generated arrivals", () => {
  const senders = ["0x00000000000000000000000000000000000000a1", "0x00000000000000000000000000000000000000b2", null] as const;
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);

  it("the parts always add up to the arrival, are never empty or negative, and not-income always has evidence", () => {
    for (let i = 0; i < 2_000; i++) {
      const sender = senders[next() % senders.length] ?? null;
      const amount = BigInt((next() % 5_000_000_000) + 1);
      const sent = next() % 2 === 0 ? [{ to: senders[0] as string, asset: "USDC" as const, amount: BigInt(next() % 3_000_000_000) + 1n, date: { year: 2026, month: 11, day: 1 + (next() % 9) } as never, kind: (next() % 2 === 0 ? "own" : "payee") as "own" | "payee" }] : [];
      const expectations = next() % 3 === 0 ? [{ id: "e", asset: "USDC" as const, min: amount - 1n, max: amount + 1n, expiresAt: 4_000_000_000 }] : [];
      const { parts } = classifyArrival({ id: "a", asset: "USDC", amount, sender, date: { year: 2026, month: 11, day: 10 } as never }, baseContext({ sent, expectations, owners: [senders[0] as string] }));
      expect(parts.reduce((sum, p) => sum + p.amount, 0n)).toBe(amount);
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) {
        expect(p.amount).toBeGreaterThan(0n);
        if (p.class !== "income") expect(["intent", "outflow-return"]).toContain(p.basis);
        if (p.class === "income") expect(p.basis).toBe("default");
      }
    }
  });
});
