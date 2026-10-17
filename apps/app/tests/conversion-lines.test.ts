import type { Notice } from "@strickle/agent/notice-schema";
import { describe, expect, it } from "vitest";
import { conversionLines } from "../src/activity/conversion.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";

const swap: Notice = { kind: "swap", box: "payroll", from: "USDC", amountIn: "1000000000", estimatedOut: "890000000", minOut: "881100000", referenceOut: "889900000", deviationBps: -42, feeBps: 2 };
const back: Notice = { kind: "swap", box: "taxes", from: "EURC", amountIn: "500000000", estimatedOut: "560000000", minOut: "554000000", referenceOut: "559000000", deviationBps: 18, feeBps: 2 };
const held: Notice = { kind: "swap-held", box: "operating", reason: "stale-feed" };
const currencies = { payroll: "EUR", operating: "EUR", emergency: "USD", profit: "USD" } as const;

describe("conversionLines", () => {
  it("writes each conversion with the brain's deterministic text, in the language of the screen", () => {
    const [line] = conversionLines([swap], "en", en.boxes, currencies);
    expect(line?.text).toBe("Your Payroll box is paid in euros, so 1,000.00 USDC were converted to euros. The agent expected 890.00 EURC, accepted nothing worse than 881.10 EURC, and the market reference was 889.90 EURC (a difference of -0.42%). Fees: 0.02%.");
    const [spanish] = conversionLines([swap], "es", es.boxes, currencies);
    expect(spanish?.text).toContain("Tu cajita Nómina se paga en euros");
  });

  it("reads a conversion back to dollars in the other direction, with the received asset named", () => {
    const [line] = conversionLines([back], "en", en.boxes, currencies);
    expect(line?.text).toContain("is paid in dollars, so 500.00 EURC were converted to dollars");
    expect(line?.text).toContain("560.00 USDC");
  });

  it("says a pause in the currency the box is declared in, and keeps the order given", () => {
    const lines = conversionLines([held, swap], "en", en.boxes, currencies);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.text).toBe("Conversions to euros for your Operating cash box are paused: the price feed is out of date. Your money stays in dollars and everything else keeps working.");
    expect(lines[0]?.kind).toBe("swap-held");
    expect(lines[1]?.kind).toBe("swap");
  });

  it("ignores every other kind of notice", () => {
    expect(conversionLines([{ kind: "salary", month: "2026-11", paid: "1", pending: "0" }], "en", en.boxes, currencies)).toEqual([]);
  });
});
