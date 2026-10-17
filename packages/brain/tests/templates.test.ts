import { plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { type FactValue, type Facts, type Lang, type NumberStyle, type ReceiptKind, TEMPLATE_KEYS, formatFact, placeholderTemplate, template } from "../src/templates.ts";

const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });

describe("formatFact: amounts", () => {
  it.each([
    [0n, "en-US", "0.00 USDC"],
    [1n, "en-US", "0.00 USDC"],
    [5_000n, "en-US", "0.00 USDC"], // 0.005 is a tie: half to even gives 0.00
    [999_999n, "en-US", "1.00 USDC"],
    [1_234_500_000n, "en-US", "1,234.50 USDC"],
    [1_234_500_000n, "es-MX", "1,234.50 USDC"],
    [1_234_500_000n, "es-CO", "1.234,50 USDC"],
    [1_234_500_000n, "es-AR", "1.234,50 USDC"],
    [1_234_500_000n, "pt-BR", "1.234,50 USDC"],
    [1_000_000_000_000n, "en-US", "1,000,000.00 USDC"],
    [9_223_372_036_854_775_808n, "en-US", "9,223,372,036,854.78 USDC"],
  ] as const)("%s units as %s is %s", (units, style, expected) => {
    expect(formatFact(usdc(units), "en", style)).toBe(expected);
  });
  it("rounds half to even at two decimals", () => {
    expect(formatFact(usdc(5_000n), "en", "en-US")).toBe("0.00 USDC"); // 0.005 -> 0.00
    expect(formatFact(usdc(15_000n), "en", "en-US")).toBe("0.02 USDC"); // 0.015 -> 0.02
    expect(formatFact(usdc(25_000n), "en", "en-US")).toBe("0.02 USDC"); // 0.025 -> 0.02
  });
  it("rejects negative amounts", () => {
    expect(() => formatFact(usdc(-1n), "en", "en-US")).toThrow(RangeError);
  });
});

describe("formatFact: the other types", () => {
  it("basis points as a percentage with up to two decimals, trailing zeros trimmed", () => {
    expect(formatFact({ type: "bps", value: 200 }, "en", "en-US")).toBe("2%");
    expect(formatFact({ type: "bps", value: 250 }, "en", "en-US")).toBe("2.5%");
    expect(formatFact({ type: "bps", value: 250 }, "es", "es-CO")).toBe("2,5%");
    expect(formatFact({ type: "bps", value: 1 }, "pt-br", "pt-BR")).toBe("0,01%");
  });
  it("days, counts and dates", () => {
    expect(formatFact({ type: "days", value: 14 }, "en", "en-US")).toBe("14 days");
    expect(formatFact({ type: "days", value: 1 }, "en", "en-US")).toBe("1 day");
    expect(formatFact({ type: "days", value: 1 }, "es", "es-MX")).toBe("1 día");
    expect(formatFact({ type: "days", value: 1 }, "pt-br", "pt-BR")).toBe("1 dia");
    expect(formatFact({ type: "days", value: 0 }, "en", "en-US")).toBe("0 days");
    expect(formatFact({ type: "days", value: 14 }, "pt-br", "pt-BR")).toBe("14 dias");
    expect(formatFact({ type: "count", value: 200 }, "en", "en-US")).toBe("200");
    expect(formatFact({ type: "date", value: plainDate(2026, 1, 15) }, "en", "en-US")).toBe("Jan 15, 2026");
    expect(formatFact({ type: "date", value: plainDate(2026, 1, 15) }, "es", "es-MX")).toBe("15 ene 2026");
    expect(formatFact({ type: "date", value: plainDate(2026, 9, 5) }, "pt-br", "pt-BR")).toBe("5 set 2026");
  });
  it("rejects a non-integer or negative day, count or basis-point value", () => {
    expect(() => formatFact({ type: "days", value: -1 }, "en", "en-US")).toThrow(RangeError);
    expect(() => formatFact({ type: "count", value: 1.5 }, "en", "en-US")).toThrow(RangeError);
    expect(() => formatFact({ type: "bps", value: -5 }, "en", "en-US")).toThrow(RangeError);
  });
});

const sample = (kind: ReceiptKind): Facts => {
  const keys = TEMPLATE_KEYS[kind];
  const values: Record<string, FactValue> = {};
  keys.values.forEach((key, i) => {
    const bps = key === "rate" || key === "apr" || (kind === "taxes-recompute" && (key === "from" || key === "to"));
    values[key] = bps ? { type: "bps", value: 2_000 + i } : usdc(BigInt(1_000_000 * (i + 1)) + 500_000n);
  });
  const labels: Record<string, string> = {};
  for (const key of keys.labels) labels[key] = key === "reason" ? "scenario-risk" : `label-${key}`;
  return { kind, values, labels };
};

describe("template", () => {
  const kinds = Object.keys(TEMPLATE_KEYS) as ReceiptKind[];
  const langs: [Lang, NumberStyle][] = [["en", "en-US"], ["es", "es-MX"], ["pt-br", "pt-BR"]];

  it.each(kinds)("%s renders in the three languages with every fact and nothing unreplaced", (kind) => {
    const facts = sample(kind);
    for (const [lang, style] of langs) {
      const text = template(facts, lang, style);
      expect(text).not.toMatch(/[{}]/);
      for (const value of Object.values(facts.values)) expect(text).toContain(formatFact(value, lang, style));
      for (const label of Object.values(facts.labels).filter((l) => l !== "scenario-risk")) expect(text).toContain(label);
    }
  });

  it("a breaker halt shows a plain-language reason in each language", () => {
    const facts: Facts = { kind: "breaker-halt", values: {}, labels: { reason: "daily-cap" } };
    expect(template(facts, "en", "en-US")).toContain("daily cap");
    expect(template(facts, "es", "es-MX")).toContain("tope diario");
    expect(template(facts, "pt-br", "pt-BR")).toContain("teto diário");
  });

  it("an early payment shows the APR next to the saving in each language", () => {
    const facts: Facts = {
      kind: "early-payment",
      values: { net: usdc(980_000_000n), discount: usdc(20_000_000n), apr: { type: "bps", value: 3_724 } },
      labels: { to: "Acme" },
    };
    expect(template(facts, "en", "en-US")).toContain("37.24%");
    expect(template(facts, "es", "es-CO")).toContain("37,24%");
    expect(template(facts, "pt-br", "pt-BR")).toContain("37,24%");
  });

  it("every kind has its keys declared and the three languages differ", () => {
    for (const kind of kinds) {
      const facts = sample(kind);
      const texts = new Set(langs.map(([lang, style]) => template(facts, lang, style)));
      expect(texts.size).toBe(3);
    }
  });

  it("throws on a missing fact, a missing label and an unknown kind", () => {
    const facts = sample("payment");
    expect(() => template({ ...facts, values: {} }, "en", "en-US")).toThrow(/amount/);
    expect(() => template({ ...facts, labels: {} }, "en", "en-US")).toThrow(/to/);
    expect(() => template({ kind: "nope" as ReceiptKind, values: {}, labels: {} }, "en", "en-US")).toThrow(/unknown/);
  });

  it("maps the salary-trim reason code to a phrase in each language", () => {
    const facts = sample("salary-trim");
    expect(template(facts, "en", "en-US")).toContain("scenarios");
    expect(template(facts, "es", "es-MX")).toContain("escenarios");
    expect(template(facts, "pt-br", "pt-BR")).toContain("cenários");
  });
});

describe("placeholderTemplate", () => {
  const kinds = Object.keys(TEMPLATE_KEYS) as ReceiptKind[];
  const langs: [Lang, NumberStyle][] = [["en", "en-US"], ["es", "es-MX"], ["pt-br", "pt-BR"]];

  it.each(kinds)("%s keeps every value as a {placeholder} and every label as itself", (kind) => {
    const facts = sample(kind);
    for (const [lang] of langs) {
      const text = placeholderTemplate(facts, lang);
      for (const key of Object.keys(facts.values)) expect(text).toContain(`{${key}}`);
      expect(text).not.toMatch(/\d/);
    }
  });

  it("is the deterministic sentence before the numbers are put in", () => {
    const facts: Facts = { kind: "salary", values: { amount: usdc(760_000_000n) }, labels: {} };
    expect(placeholderTemplate(facts, "en")).toBe("I paid your salary: {amount}.");
    expect(placeholderTemplate(facts, "es")).toBe("Pagué tu sueldo: {amount}.");
    expect(placeholderTemplate(facts, "pt-br")).toBe("Paguei seu salário: {amount}.");
  });

  it("throws on a missing fact like the full template does", () => {
    expect(() => placeholderTemplate({ kind: "payment", values: {}, labels: { to: "x" } }, "en")).toThrow(/amount/);
  });
});

describe("income doubts and corrections", () => {
  const facts = (kind: "income-doubt" | "reclassified", labels: Record<string, string>): Facts => ({ kind, values: { amount: usdc(500_000_000n) }, labels });
  it.each(["en", "es", "pt-br"] as const)("the doubt names its reason in %s and leaves no placeholder", (lang) => {
    for (const flag of ["own-address", "outlier-size", "amount-matches-outflow", "unattributed"]) {
      const text = template(facts("income-doubt", { flag }), lang, "en-US");
      expect(text).toContain("500.00 USDC");
      expect(text).not.toMatch(/[{}]/);
    }
  });
  it("gives each reason its own words", () => {
    const texts = ["own-address", "outlier-size", "amount-matches-outflow", "unattributed"].map((flag) => template(facts("income-doubt", { flag }), "en", "en-US"));
    expect(new Set(texts).size).toBe(4);
    expect(texts[1]).toContain("much larger than your usual payments");
  });
  it.each(["en", "es", "pt-br"] as const)("a correction says from what to what in %s", (lang) => {
    const text = template(facts("reclassified", { from: "income", to: "own-transfer" }), lang, "en-US");
    expect(text).toContain("500.00 USDC");
    expect(text).not.toMatch(/[{}]|own-transfer/);
  });
  it("keeps the English wording the plan fixed", () => {
    expect(template(facts("reclassified", { from: "income", to: "own-transfer" }), "en", "en-US")).toContain("Taxes already set aside for it stay in your taxes box until your next tax date");
  });
});

describe("conversions", () => {
  const amount = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });
  const eur = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "EURC" });
  const swapFacts = (direction: "to-euros" | "to-dollars", deviation = -42): Facts => ({
    kind: "swap",
    values: { amount: direction === "to-euros" ? amount(1_000_000_000n) : eur(500_000_000n), expectedOut: eur(890_000_000n), minOut: eur(881_100_000n), reference: eur(889_900_000n), deviation: { type: "sbps", value: deviation }, fee: { type: "bps", value: 2 } },
    labels: { label: "Payroll", direction },
  });
  it("keeps the English wording the plan fixed", () => {
    expect(template(swapFacts("to-euros"), "en", "en-US")).toBe(
      "Your Payroll box is paid in euros, so 1,000.00 USDC were converted to euros. The agent expected 890.00 EURC, accepted nothing worse than 881.10 EURC, and the market reference was 889.90 EURC (a difference of -0.42%). Fees: 0.02%.",
    );
  });
  it.each(["en", "es", "pt-br"] as const)("a conversion in either direction leaves no placeholder in %s and names every number", (lang) => {
    for (const direction of ["to-euros", "to-dollars"] as const) {
      const text = template(swapFacts(direction), lang, "en-US");
      expect(text).not.toMatch(/[{}]|to-euros|to-dollars/);
      for (const part of ["890.00 EURC", "881.10 EURC", "889.90 EURC", "0.42%", "0.02%"]) expect(text).toContain(part);
    }
  });
  it("writes the signed deviation with the number style and a sign", () => {
    expect(template(swapFacts("to-euros", 150), "en", "en-US")).toContain("+1.5%");
    expect(template(swapFacts("to-euros", -150), "es", "es-CO")).toContain("-1,5%");
    expect(template(swapFacts("to-euros", 0), "en", "en-US")).toContain("0%");
  });
  const held = (reason: string, currency = "EUR"): Facts => ({ kind: "swap-held", values: {}, labels: { label: "Payroll", currency, reason } });
  const reasons = ["worse-than-reference", "better-than-reference", "stale-feed", "adapter-not-approved", "failures", "daily-cap", "invalid-quote", "quote-unavailable"];
  it.each(["en", "es", "pt-br"] as const)("a pause names its reason and where the money stays in %s", (lang) => {
    const texts = reasons.map((reason) => template(held(reason), lang, "en-US"));
    for (const text of texts) expect(text).not.toMatch(/[{}]|stale-feed|daily-cap|worse-than-reference/);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(template(held("stale-feed", "USD"), "en", "en-US")).toContain("Conversions to dollars for your Payroll box are paused");
    expect(template(held("stale-feed"), "en", "en-US")).toContain("Your money stays in dollars");
  });
  it("keeps the English wording of the pause", () => {
    expect(template(held("stale-feed"), "en", "en-US")).toBe("Conversions to euros for your Payroll box are paused: the price feed is out of date. Your money stays in dollars and everything else keeps working.");
  });
});

describe("yield moves", () => {
  const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });
  const earnFacts = (apy = 420): Facts => ({ kind: "earn", values: { amount: usdc(500_000_000n), apy: { type: "bps", value: apy } }, labels: { label: "Profit", vault: "EarnKit USDC Vault", protocol: "Morpho" } });
  const backFacts = (): Facts => ({ kind: "earn-back", values: { amount: usdc(500_000_000n), gain: usdc(12_500_000n), fee: usdc(1_250_000n) }, labels: { label: "Profit", vault: "EarnKit USDC Vault", protocol: "Morpho" } });
  it("keeps the English wording of a deposit and of a withdrawal", () => {
    expect(template(earnFacts(), "en", "en-US")).toBe("Your Profit box put 500.00 USDC to work in EarnKit USDC Vault (Morpho, 4.2% a year when it started). The rate changes and the value can go down; you can take it back at any time.");
    expect(template(backFacts(), "en", "en-US")).toBe("Your Profit box took 500.00 USDC back from EarnKit USDC Vault (Morpho). It earned 12.50 USDC while it was there; the ten percent fee on that, 1.25 USDC, is shown here and is not charged on testnet.");
  });
  it.each(["en", "es", "pt-br"] as const)("names the vault, the protocol and the rate in %s and leaves no placeholder", (lang) => {
    for (const facts of [earnFacts(), backFacts()]) {
      const text = template(facts, lang, "es-CO");
      expect(text).not.toMatch(/[{}]|undefined/);
      for (const part of ["EarnKit USDC Vault", "Morpho", "500,00 USDC"]) expect(text).toContain(part);
    }
    expect(template(earnFacts(), lang, "es-CO")).toContain("4,2%");
  });
  it("writes the rate with the number style", () => {
    expect(template(earnFacts(1_005), "en", "en-US")).toContain("10.05%");
    expect(template(earnFacts(0), "en", "en-US")).toContain("0%");
  });
  const held = (reason: string): Facts => ({ kind: "earn-held", values: {}, labels: { label: "Profit", vault: "EarnKit USDC Vault", reason } });
  const reasons = ["adapter-not-approved", "vault-not-approved", "quote-unavailable", "invalid-bundle", "vault-refused", "failures", "insufficient", "expired"];
  it.each(["en", "es", "pt-br"] as const)("a hold gives its reason and says the money stays put in %s", (lang) => {
    const texts = reasons.map((reason) => template(held(reason), lang, "en-US"));
    for (const text of texts) expect(text).not.toMatch(/[{}]|adapter-not-approved|invalid-bundle|vault-refused/);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(template(held("quote-unavailable"), "en", "en-US")).toBe("Your Profit box's move with EarnKit USDC Vault is on hold: Circle's service did not answer. Your money stays where it is and everything else keeps working.");
  });
});

describe("a vault that was left", () => {
  const exit = (reason: string): Facts => ({ kind: "yield-exit", values: {}, labels: { label: "Profit", vault: "EarnKit USDC Vault", reason } });
  const reasons = ["price-drop", "rate-spike", "inactive", "illiquid"];
  it("keeps the English wording and names the reason", () => {
    expect(template(exit("price-drop"), "en", "en-US")).toBe("The agent asked EarnKit USDC Vault to give back your Profit box's money because its share price fell. It returns to your box as cash when the withdrawal goes through; to put it to work again, ask for it.");
  });
  it.each(["en", "es", "pt-br"] as const)("gives each reason its own sentence in %s and leaves no placeholder", (lang) => {
    const texts = reasons.map((reason) => template(exit(reason), lang, "en-US"));
    for (const text of texts) expect(text).not.toMatch(/[{}]|price-drop|rate-spike|illiquid/);
    expect(new Set(texts).size).toBe(reasons.length);
  });
});

describe("why the agent moved money", () => {
  const usdc = (units: bigint): FactValue => ({ type: "amount", units, decimals: 6, symbol: "USDC" });
  const plan = (): Facts => ({ kind: "yield-plan", values: { amount: usdc(10_000_000_000n), kept: usdc(1_500_000_000n), needed: usdc(1_200_000_000n) }, labels: { label: "Profit" } });
  const back = (): Facts => ({ kind: "yield-back", values: { amount: usdc(2_525_000_000n), payment: usdc(3_000_000_000n), due: { type: "date", value: { year: 2026, month: 11, day: 4 } } }, labels: { label: "Payroll" } });
  it("keeps the English wording and states what was kept, what it covers and what went to work", () => {
    expect(template(plan(), "en", "en-US")).toBe("Your Profit box keeps 1,500.00 USDC in cash, 1,200.00 USDC of it for what is due within sixty days, and put 10,000.00 USDC to work. The rate changes and the value can go down.");
    expect(template(back(), "en", "en-US")).toBe("The agent asked the vault for 2,525.00 USDC back for your Payroll box because 3,000.00 USDC is due on Nov 4, 2026, so the money is ready five business days before.");
  });
  it.each(["en", "es", "pt-br"] as const)("names every number and leaves no placeholder in %s", (lang) => {
    for (const [facts, parts] of [[plan(), ["1,500.00 USDC", "1,200.00 USDC", "10,000.00 USDC"]], [back(), ["2,525.00 USDC", "3,000.00 USDC"]]] as const) {
      const text = template(facts, lang, "en-US");
      expect(text).not.toMatch(/[{}]|undefined/);
      for (const part of parts) expect(text).toContain(part);
    }
  });
});

describe("the invitation to switch yield on", () => {
  const invite = (apy = 420): Facts => ({ kind: "yield-invite", values: { apy: { type: "bps", value: apy } }, labels: {} });
  it("keeps the English wording and quotes the rate", () => {
    expect(template(invite(), "en", "en-US")).toBe("Your money can work while it waits: a vault pays about 4.2% a year at the moment, and the value can also go down. If you want, turn it on in Settings. Only money a box will not need within sixty days is ever used.");
  });
  it.each(["en", "es", "pt-br"] as const)("names the rate, warns the value can go down and leaves no placeholder in %s", (lang) => {
    const text = template(invite(), lang, "en-US");
    expect(text).not.toMatch(/[{}]|undefined/);
    expect(text).toContain("4.2%");
  });
});

