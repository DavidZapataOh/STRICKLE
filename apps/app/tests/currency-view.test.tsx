import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_DOLLARS, CurrencyControl } from "../src/components/CurrencyControl.tsx";
import type { ConversionStatus } from "../src/boxes/currency.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import { settingsText } from "../src/i18n/slices.ts";

const view = (status: ConversionStatus, dictionary: typeof en = en, lang: "en" | "es" = "en", currencies = ALL_DOLLARS) =>
  renderToStaticMarkup(<CurrencyControl lang={lang} t={settingsText(dictionary)} currencies={currencies} status={status} />);

describe("CurrencyControl", () => {
  it("shows the four boxes that can be euros and the two that are always dollars, with the reason", () => {
    const out = view({ kind: "active", cap: 5_000_000_000n });
    for (const box of ["Payroll", "Operating cash", "Emergency fund", "Profit"]) expect(out).toContain(box);
    expect(out.match(/type="radio"/g)).toHaveLength(8);
    expect(out).toContain("Always dollars: your salary is paid in dollars.");
    expect(out).toContain("Always dollars: taxes leave in your local currency.");
  });

  it("reads the cap from the vault into the sentence and quotes the 1.5% bound", () => {
    const out = view({ kind: "active", cap: 2_500_000_000n });
    expect(out).toContain("never more than US$2,500.00 a day");
    expect(out).toContain("1.5% below the market reference");
  });

  it("marks the declared currency", () => {
    const out = view({ kind: "active", cap: 5_000_000_000n }, en, "en", { ...ALL_DOLLARS, payroll: "EUR" });
    expect(out).toMatch(/name="currency-payroll" value="USD"\/>/);
    expect(out).toMatch(/name="currency-payroll" checked="" value="EUR"/);
  });

  it.each([
    [{ kind: "active", cap: 1n }, "Conversions are active."],
    [{ kind: "pending", from: 1_800_000_000 }, "Conversions will be active on"],
    [{ kind: "unavailable" }, "created before conversions existed"],
    [{ kind: "not-allowed" }, "not allowed on this account yet"],
    [{ kind: "paused", reason: "stale-feed", cap: 1n }, "Conversions are paused: the price feed is out of date."],
  ] as [ConversionStatus, string][])("says each state of the chain in English: %#", (status, text) => {
    expect(view(status)).toContain(text);
  });

  it("offers the signature to allow conversions only where they are not allowed yet, and disables the choices where they cannot work", () => {
    expect(view({ kind: "not-allowed" })).toContain("Allow conversions");
    expect(view({ kind: "active", cap: 1n })).not.toContain("Allow conversions");
    expect(view({ kind: "unavailable" })).toContain("<fieldset class=\"choices\" disabled=\"\"");
  });

  it("speaks Spanish too, and the pending date follows the language", () => {
    const out = view({ kind: "pending", from: 1_800_000_000 }, es as unknown as typeof en, "es");
    expect(out).toContain("Las conversiones estarán activas el");
    expect(out).toContain("Siempre dólares: tu sueldo se paga en dólares.");
  });

  it("never promises a rate, a saving, a speed or safety", () => {
    for (const status of [{ kind: "active", cap: 1n }, { kind: "pending", from: 1 }, { kind: "not-allowed" }, { kind: "unavailable" }] as ConversionStatus[]) {
      expect(view(status)).not.toMatch(/guarantee|insured|no risk|you will save|best rate|faster/i);
    }
  });
});
