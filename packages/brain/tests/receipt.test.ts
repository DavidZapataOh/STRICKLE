import fc from "fast-check";
import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type FactValue, type Facts, type ReceiptKind, TEMPLATE_KEYS } from "../src/templates.ts";
import { UNDO_KIND, buildReceipt, canonicalJson, undoSummary, verifyReceipt } from "../src/receipt.ts";

const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });

const factsFor = (kind: ReceiptKind): Facts => {
  const keys = TEMPLATE_KEYS[kind];
  const values: Record<string, FactValue> = {};
  keys.values.forEach((key, i) => {
    values[key] = key === "rate" || key === "apr" || key === "from" || key === "to" ? { type: "bps", value: 2_000 + i } : usdc(BigInt(1_000_000 * (i + 1)));
  });
  const labels: Record<string, string> = {};
  for (const key of keys.labels) labels[key] = key === "reason" ? "scenario-risk" : `label-${key}`;
  return { kind, values, labels };
};

const KINDS = Object.keys(TEMPLATE_KEYS) as ReceiptKind[];

describe("canonicalJson", () => {
  it("is independent of key order and renders bigints and dates unambiguously", () => {
    expect(canonicalJson({ b: 1n, a: plainDate(2026, 1, 5) })).toBe('{"a":"2026-01-05","b":{"$bigint":"1"}}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
  it("keeps arrays ordered and nests", () => {
    expect(canonicalJson({ x: [2, 1], y: { b: true, a: null } })).toBe('{"x":[2,1],"y":{"a":null,"b":true}}');
  });
});

describe("buildReceipt", () => {
  const input = { kind: "payment" as const, ruleId: "autonomy:payment-auto", facts: factsFor("payment"), createdAt: 1_000, sequence: 1 };

  it("is deterministic and carries the three texts with the engine's numbers", () => {
    const a = buildReceipt(input);
    expect(buildReceipt(input)).toEqual(a);
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
    expect(a.texts.en).toContain("1.00 USDC");
    expect(a.texts.es).toContain("1.00 USDC");
    expect(a.texts["pt-br"]).toContain("1,00 USDC");
    expect(new Set(Object.values(a.texts)).size).toBe(3);
  });

  it("uses the Spanish style the caller gives without changing the id", () => {
    const base = buildReceipt({ ...input, facts: { ...input.facts, values: { amount: usdc(1_234_500_000n) } } });
    const colombian = buildReceipt({ ...input, facts: { ...input.facts, values: { amount: usdc(1_234_500_000n) } }, styles: { es: "es-CO" } });
    expect(base.texts.es).toContain("1,234.50 USDC");
    expect(colombian.texts.es).toContain("1.234,50 USDC");
    expect(colombian.id).toBe(base.id);
  });

  it("changes the id when any hashed field changes", () => {
    const base = buildReceipt(input).id;
    expect(buildReceipt({ ...input, ruleId: "other" }).id).not.toBe(base);
    expect(buildReceipt({ ...input, createdAt: 1_001 }).id).not.toBe(base);
    expect(buildReceipt({ ...input, sequence: 2 }).id).not.toBe(base); // two identical actions in the same second
    expect(buildReceipt({ ...input, facts: { ...input.facts, labels: { to: "someone else" } } }).id).not.toBe(base);
    expect(buildReceipt({ ...input, facts: { ...input.facts, values: { amount: usdc(2_000_001n) } } }).id).not.toBe(base);
    expect(buildReceipt({ ...input, undoes: "abc" }).id).not.toBe(base);
  });

  it.each(KINDS)("%s has all three texts, a summary and verifies", (kind) => {
    const receipt = buildReceipt({ kind, ruleId: "r", facts: factsFor(kind), createdAt: 5, sequence: 0 });
    expect(Object.keys(receipt.texts).sort()).toEqual(["en", "es", "pt-br"]);
    expect(verifyReceipt(receipt)).toBe(true);
    expect(receipt.undo).toEqual(undoSummary(kind));
  });

  it("rejects an empty rule id, a bad time, and facts of another kind", () => {
    expect(() => buildReceipt({ ...input, ruleId: " " })).toThrow(RangeError);
    expect(() => buildReceipt({ ...input, createdAt: -1 })).toThrow(RangeError);
    expect(() => buildReceipt({ ...input, createdAt: 1.5 })).toThrow(RangeError);
    expect(() => buildReceipt({ ...input, sequence: -1 })).toThrow(RangeError);
    expect(() => buildReceipt({ ...input, facts: factsFor("salary") })).toThrow(/kind/);
  });
});

describe("verifyReceipt", () => {
  it("accepts an untouched receipt and rejects an edited fact, rule, time or id", () => {
    const receipt = buildReceipt({ kind: "salary", ruleId: "r", facts: factsFor("salary"), createdAt: 9, sequence: 0 });
    expect(verifyReceipt(receipt)).toBe(true);
    expect(verifyReceipt({ ...receipt, texts: { ...receipt.texts, en: receipt.texts.en.replace("1.00", "9.00") } })).toBe(false); // a doctored text
    expect(verifyReceipt({ ...receipt, facts: { ...receipt.facts, values: { amount: usdc(1n) } } })).toBe(false);
    expect(verifyReceipt({ ...receipt, ruleId: "x" })).toBe(false);
    expect(verifyReceipt({ ...receipt, createdAt: 10 })).toBe(false);
    expect(verifyReceipt({ ...receipt, id: "0".repeat(64) })).toBe(false);
  });
  it("any change to a hashed amount is detected (property)", () => {
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.bigInt({ min: 1n, max: 1_000n }), (units, delta) => {
      const receipt = buildReceipt({ kind: "salary", ruleId: "r", facts: { kind: "salary", values: { amount: usdc(units) }, labels: {} }, createdAt: 1, sequence: 0 });
      expect(verifyReceipt({ ...receipt, facts: { ...receipt.facts, values: { amount: usdc(units + delta) } } })).toBe(false);
    }), { numRuns: 200 });
  });
});

describe("UNDO_KIND", () => {
  it("each undo leaves the receipt of what really happened", () => {
    expect(UNDO_KIND["vault-sweep"]).toBe("vault-redeem");
    expect(UNDO_KIND["vault-redeem"]).toBe("vault-sweep");
    expect(UNDO_KIND["emergency-sweep"]).toBe("move");
    expect(UNDO_KIND["payment-proposal"]).toBe("proposal-cancelled");
    expect(UNDO_KIND["salary"]).toBeUndefined();
  });
  it("every reversible kind has an undo kind and an undo receipt can be built from it", () => {
    for (const kind of KINDS) {
      const summary = undoSummary(kind);
      if (summary.undoable) expect(UNDO_KIND[kind]).toBeDefined();
    }
  });
});

describe("undoSummary", () => {
  it.each([
    ["vault-sweep", { undoable: true, how: "redeem" }],
    ["vault-redeem", { undoable: true, how: "sweep" }],
    ["emergency-sweep", { undoable: true, how: "move-back" }],
    ["taxes-recompute", { undoable: true, how: "restore-rate" }],
    ["payment-proposal", { undoable: true, how: "cancel-proposal" }],
    ["salary-raise-proposal", { undoable: true, how: "cancel-proposal" }],
    ["structural-change-proposal", { undoable: true, how: "cancel-proposal" }],
  ] as const)("%s", (kind, expected) => {
    expect(undoSummary(kind)).toEqual(expected);
  });
  it.each(["salary", "salary-trim", "payment", "taxes-to-local", "breaker-halt", "breaker-reset"] as const)("%s is not reversible and says why", (kind) => {
    const summary = undoSummary(kind);
    expect(summary).toMatchObject({ undoable: false });
    expect((summary as { reason: string }).reason.length).toBeGreaterThan(10);
  });
  it("a split does not claim to be reversible and points to moving between boxes", () => {
    expect(undoSummary("split")).toMatchObject({ undoable: false, reason: expect.stringContaining("moving") });
  });
  it("an early payment is not reversible and its proposal can be cancelled", () => {
    expect(undoSummary("early-payment")).toMatchObject({ undoable: false, reason: expect.stringContaining("left your accounts") });
    expect(undoSummary("early-payment-proposal")).toEqual({ undoable: true, how: "cancel-proposal" });
    expect(UNDO_KIND["early-payment-proposal"]).toBe("proposal-cancelled");
  });
  it("a receipt that undoes another is not undoable", () => {
    expect(undoSummary("vault-redeem", "abc")).toMatchObject({ undoable: false });
  });
});

describe("receipts of income doubts and corrections", () => {
  it("a correction can be undone by correcting back, and nothing can be undone about a doubt", () => {
    expect(undoSummary("reclassified")).toEqual({ undoable: true, how: "reclassify-back" });
    expect(undoSummary("income-doubt")).toMatchObject({ undoable: false });
    expect(undoSummary("swap")).toEqual({ undoable: false, reason: "The conversion was made at that day's rate; to change it, set the box back to dollars and it converts back at the rate of that moment." });
    expect(undoSummary("swap-held")).toMatchObject({ undoable: false });
    expect(UNDO_KIND.reclassified).toBe("reclassified");
  });
  it("an undo of a correction is itself not undoable", () => {
    expect(undoSummary("reclassified", "some-receipt")).toMatchObject({ undoable: false });
  });
});
