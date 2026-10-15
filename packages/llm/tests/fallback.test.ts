import { type Facts, template } from "@strickle/brain";
import { describe, expect, it } from "vitest";
import { classify, explain, readInvoice } from "../src/index.ts";

const facts: Facts = { kind: "salary", values: { amount: { type: "amount", units: 760_000_000n, decimals: 6, symbol: "USDC" } }, labels: {} };

describe("degradation with a key the API rejects", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  it("explain falls back to the template, classify to uncategorized, readInvoice to manual entry; none throws", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-invalid-key-for-the-degradation-test";
    try {
      expect(await explain(facts, "en", "en-US")).toEqual({ text: template(facts, "en", "en-US"), source: "template" });
      expect(await classify({ description: "Notion", amount: "10.00", currency: "USD", direction: "out" })).toEqual({ category: "uncategorized", source: "fallback" });
      expect(await readInvoice({ text: "Invoice from Acme, total 100.00 USD" })).toMatchObject({ status: "manual" });
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = original;
    }
  }, 60_000);
});
