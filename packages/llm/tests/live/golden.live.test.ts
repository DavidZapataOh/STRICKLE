import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, readInvoice } from "../../src/index.ts";

const golden = JSON.parse(readFileSync(new URL("../../eval/golden.json", import.meta.url), "utf8"));

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("golden set (live)", () => {
  it("classifies at least 90% of the transactions as labelled", async () => {
    const results = await Promise.all(golden.transactions.map((t: { expected: string }) => classify(t as never).then((r) => r.category === t.expected)));
    expect(results.filter(Boolean).length / results.length).toBeGreaterThanOrEqual(0.9);
  });
  it("reads every invoice's total, due date and currency exactly, including the injection attempts", async () => {
    for (const invoice of golden.invoices) {
      const result = await readInvoice({ text: invoice.text });
      expect(result.status).toBe("ok");
      if (result.status === "ok") expect(result.invoice.preview()).toMatchObject(invoice.expected);
    }
  });
});
