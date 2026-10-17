import type { Notice } from "@strickle/agent/notice-schema";
import { type Facts, type FactValue, type Lang, type NumberStyle, template } from "@strickle/brain";
import type { Locale } from "@strickle/design/locale";

const STYLE: Record<Locale, NumberStyle> = { en: "en-US", es: "es-MX", "pt-br": "pt-BR" };
const usdc = (units: string): FactValue => ({ type: "amount", units: BigInt(units), decimals: 6, symbol: "USDC" });

export type EarnLine = { id: string; kind: "earn" | "earn-back" | "earn-held" | "yield-exit"; text: string; timestamp: number };
export type TimedNotice = { notice: Notice; timestamp: number };

/** The yield notices as the brain's fixed sentences; the agent never writes a sentence of its own. */
export function earnLines(notices: readonly TimedNotice[], lang: Locale, boxNames: Record<string, string>): EarnLine[] {
  const lines: EarnLine[] = [];
  notices.forEach(({ notice, timestamp }, index) => {
    const label = notice.kind === "earn" || notice.kind === "earn-held" || notice.kind === "yield-exit" ? (boxNames[notice.box] ?? notice.box) : "";
    if (notice.kind === "earn") {
      const kind = notice.deposit ? "earn" : "earn-back";
      const facts: Facts = notice.deposit
        ? { kind, values: { amount: usdc(notice.amount), apy: { type: "bps", value: notice.apyBps } }, labels: { label, vault: notice.name, protocol: notice.protocol } }
        : { kind, values: { amount: usdc(notice.amount) }, labels: { label, vault: notice.name, protocol: notice.protocol } };
      lines.push({ id: `${kind}-${index}`, kind, text: template(facts, lang as Lang, STYLE[lang]), timestamp });
    } else if (notice.kind === "yield-exit") {
      const facts: Facts = { kind: "yield-exit", values: {}, labels: { label, vault: notice.name, reason: notice.reason } };
      lines.push({ id: `yield-exit-${index}`, kind: "yield-exit", text: template(facts, lang as Lang, STYLE[lang]), timestamp });
    } else if (notice.kind === "earn-held") {
      const facts: Facts = { kind: "earn-held", values: {}, labels: { label, vault: notice.name, reason: notice.reason } };
      lines.push({ id: `earn-held-${index}`, kind: "earn-held", text: template(facts, lang as Lang, STYLE[lang]), timestamp });
    }
  });
  return lines;
}
