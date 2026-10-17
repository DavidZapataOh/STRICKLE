import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DoubtCard } from "../src/components/DoubtCard.tsx";
import { ReclassifiedStrip } from "../src/components/ReclassifiedStrip.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import { activityText } from "../src/i18n/slices.ts";

const doubt = { arrivalId: "0123456789", asset: "USDC" as const, amount: 2_500_000_000n, flags: ["outlier-size" as const, "own-address" as const], sender: "0x00000000000000000000000000000000000000a1" as const, answered: false };

describe("DoubtCard", () => {
  it("says why the arrival is in doubt and offers both answers", () => {
    const out = renderToStaticMarkup(<DoubtCard doubt={doubt} locale="en" t={activityText(en)} phase="idle" onIncome={() => {}} onMine={() => {}} />);
    expect(out).toContain("$2,500.00");
    expect(out).toContain("It is much larger than your usual payments");
    expect(out).toContain("It came from an address you may own");
    expect(out).toContain("0x0000…00a1");
    expect(out).toContain("It was income");
    expect(out).toContain("It was my own money");
    expect(out).not.toContain("disabled");
  });
  it("blocks both answers while a signature is in flight, and says so in Spanish", () => {
    const out = renderToStaticMarkup(<DoubtCard doubt={doubt} locale="es" t={activityText(es)} phase="signing" onIncome={() => {}} onMine={() => {}} />);
    expect(out.match(/disabled/g)).toHaveLength(2);
    expect(out).toContain(es.doubt.working);
  });
});

describe("ReclassifiedStrip", () => {
  it("states the correction and offers one signature to undo it", () => {
    const out = renderToStaticMarkup(<ReclassifiedStrip correction={{ arrivalId: "0123456789", amount: 2_500_000_000n, from: "income", to: "own-transfer" }} locale="en" t={activityText(en)} phase="idle" onUndo={() => {}} />);
    expect(out).toContain("$2,500.00 as your own money instead of income.");
    expect(out).toContain("Undo");
  });
});
