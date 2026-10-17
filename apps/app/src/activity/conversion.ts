import type { Notice } from "@strickle/agent/notice-schema";
import { type Facts, type FactValue, type Lang, type NumberStyle, template } from "@strickle/brain";
import type { Locale } from "@strickle/design/locale";

const STYLE: Record<Locale, NumberStyle> = { en: "en-US", es: "es-MX", "pt-br": "pt-BR" };
const amount = (units: string, symbol: "USDC" | "EURC"): FactValue => ({ type: "amount", units: BigInt(units), decimals: 6, symbol });

export type ConversionLine = { id: string; kind: "swap" | "swap-held"; text: string };

/** The conversion notices as the brain's fixed sentences; the agent never writes a sentence of its own. */
export function conversionLines(notices: readonly Notice[], lang: Locale, boxNames: Record<string, string>, currencies: Record<string, "USD" | "EUR">): ConversionLine[] {
  const lines: ConversionLine[] = [];
  notices.forEach((notice, index) => {
    if (notice.kind === "swap") {
      const to = notice.from === "USDC" ? "EURC" : "USDC";
      const facts: Facts = {
        kind: "swap",
        values: { amount: amount(notice.amountIn, notice.from), expectedOut: amount(notice.estimatedOut, to), minOut: amount(notice.minOut, to), reference: amount(notice.referenceOut, to), deviation: { type: "sbps", value: notice.deviationBps }, fee: { type: "bps", value: notice.feeBps } },
        labels: { label: boxNames[notice.box] ?? notice.box, direction: notice.from === "USDC" ? "to-euros" : "to-dollars" },
      };
      lines.push({ id: `swap-${index}`, kind: "swap", text: template(facts, lang as Lang, STYLE[lang]) });
    } else if (notice.kind === "swap-held") {
      const facts: Facts = { kind: "swap-held", values: {}, labels: { label: boxNames[notice.box] ?? notice.box, currency: currencies[notice.box] ?? "USD", reason: notice.reason } };
      lines.push({ id: `held-${index}`, kind: "swap-held", text: template(facts, lang as Lang, STYLE[lang]) });
    }
  });
  return lines;
}
