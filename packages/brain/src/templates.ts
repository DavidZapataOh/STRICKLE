import type { PlainDate } from "@strickle/core";

export type Lang = "en" | "es" | "pt-br";
export type NumberStyle = "en-US" | "es-MX" | "es-CO" | "es-AR" | "pt-BR";
export type ReceiptKind =
  | "split" | "taxes-recompute" | "vault-sweep" | "vault-redeem" | "emergency-sweep"
  | "salary" | "salary-trim" | "salary-raise-proposal" | "payment" | "payment-proposal"
  | "taxes-to-local" | "taxes-to-local-proposal" | "structural-change-proposal" | "breaker-halt" | "breaker-reset"
  | "move" | "proposal-cancelled";

export type FactValue =
  | { type: "amount"; units: bigint; decimals: number; symbol: string }
  | { type: "bps"; value: number }
  | { type: "days"; value: number }
  | { type: "count"; value: number }
  | { type: "date"; value: PlainDate };

export interface Facts {
  kind: ReceiptKind;
  values: Record<string, FactValue>;
  labels: Record<string, string>;
}

const SEPARATORS: Record<NumberStyle, { group: string; decimal: string }> = {
  "en-US": { group: ",", decimal: "." },
  "es-MX": { group: ",", decimal: "." },
  "es-CO": { group: ".", decimal: "," },
  "es-AR": { group: ".", decimal: "," },
  "pt-BR": { group: ".", decimal: "," },
};

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  "pt-br": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
};

const nonNegativeInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
};

const group = (digits: string, separator: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);

/** Two decimals, rounded half to even from the asset's base units, using integer arithmetic only. */
function amountText(units: bigint, decimals: number, style: NumberStyle): string {
  if (units < 0n) throw new RangeError("an amount must not be negative");
  const scale = 10n ** BigInt(decimals);
  const cents = (units * 100n) / scale;
  const remainder = (units * 100n) % scale;
  const half = scale / 2n;
  const rounded = remainder > half || (remainder === half && cents % 2n === 1n) ? cents + 1n : cents;
  const whole = (rounded / 100n).toString();
  const fraction = (rounded % 100n).toString().padStart(2, "0");
  const { group: g, decimal } = SEPARATORS[style];
  return `${group(whole, g)}${decimal}${fraction}`;
}

export function formatFact(value: FactValue, lang: Lang, style: NumberStyle): string {
  const { decimal } = SEPARATORS[style];
  switch (value.type) {
    case "amount":
      return `${amountText(value.units, value.decimals, style)} ${value.symbol}`;
    case "bps": {
      nonNegativeInteger(value.value, "bps");
      const whole = Math.floor(value.value / 100);
      const fraction = String(value.value % 100).padStart(2, "0").replace(/0+$/, "");
      return `${whole}${fraction ? decimal + fraction : ""}%`;
    }
    case "days": {
      nonNegativeInteger(value.value, "days");
      const unit = lang === "en" ? (value.value === 1 ? "day" : "days") : lang === "es" ? (value.value === 1 ? "día" : "días") : value.value === 1 ? "dia" : "dias";
      return `${value.value} ${unit}`;
    }
    case "count":
      nonNegativeInteger(value.value, "count");
      return String(value.value);
    case "date": {
      const { year, month, day } = value.value;
      const name = MONTHS[lang][month - 1];
      return lang === "en" ? `${name} ${day}, ${year}` : `${day} ${name} ${year}`;
    }
  }
}

export const TEMPLATE_KEYS: Record<ReceiptKind, { values: string[]; labels: string[] }> = {
  split: { values: ["total", "taxes", "payroll", "operating", "emergency", "salary", "profit", "rate"], labels: [] },
  "taxes-recompute": { values: ["from", "to"], labels: [] },
  "vault-sweep": { values: ["amount"], labels: ["vault"] },
  "vault-redeem": { values: ["amount"], labels: ["vault"] },
  "emergency-sweep": { values: ["amount"], labels: [] },
  salary: { values: ["amount"], labels: [] },
  "salary-trim": { values: ["paid", "owed", "pending"], labels: ["reason"] },
  "salary-raise-proposal": { values: ["from", "to"], labels: [] },
  payment: { values: ["amount"], labels: ["to"] },
  "payment-proposal": { values: ["amount"], labels: ["to"] },
  "taxes-to-local": { values: ["amount"], labels: ["currency"] },
  "taxes-to-local-proposal": { values: ["amount"], labels: ["currency"] },
  "structural-change-proposal": { values: [], labels: ["change"] },
  move: { values: ["amount"], labels: ["from", "to"] },
  "proposal-cancelled": { values: [], labels: ["what"] },
  "breaker-halt": { values: [], labels: ["reason"] },
  "breaker-reset": { values: [], labels: ["actor"] },
};

const REASONS: Record<string, Record<Lang, string>> = {
  "scenario-risk": { en: "in too many of the simulated scenarios your cushion would drop below the floor", es: "en demasiados escenarios simulados tu colchón bajaría del piso", "pt-br": "em muitos dos cenários simulados sua reserva ficaria abaixo do piso" },
  "cushion-floor": { en: "paying it would leave your cushion under the floor", es: "pagarlo dejaría tu colchón por debajo del piso", "pt-br": "pagar deixaria sua reserva abaixo do piso" },
  "taxes-not-covered": { en: "your taxes are not fully covered yet", es: "tus impuestos aún no están cubiertos", "pt-br": "seus impostos ainda não estão cobertos" },
  "insufficient-history": { en: "there is not enough history yet", es: "todavía no hay suficiente historial", "pt-br": "ainda não há histórico suficiente" },
  "spend-unknown": { en: "your monthly spend is not known yet", es: "todavía no se conoce tu gasto mensual", "pt-br": "seu gasto mensal ainda não é conhecido" },
  "salary-box": { en: "the salary box holds less than that", es: "la cajita de sueldo tiene menos que eso", "pt-br": "a caixinha de salário tem menos que isso" },
};

const HALT_REASONS: Record<string, Record<Lang, string>> = {
  "books-balance": { en: "the books did not add up", es: "las cuentas no cuadraron", "pt-br": "as contas não bateram" },
  "taxes-untouched": { en: "the taxes box would have been debited", es: "se iba a descontar de la caja de impuestos", "pt-br": "a caixa de impostos seria debitada" },
  "emergency-routing": { en: "the emergency fund would have been moved against its rules", es: "el fondo de emergencia se iba a mover contra sus reglas", "pt-br": "o fundo de emergência seria movido contra as regras" },
  "payroll-funded": { en: "the payroll due soon would not have been fully funded", es: "la nómina próxima no quedaría totalmente fondeada", "pt-br": "a folha próxima não ficaria totalmente financiada" },
  "cushion-floor": { en: "your cushion would have dropped below its floor", es: "tu colchón bajaría de su piso", "pt-br": "sua reserva ficaria abaixo do piso" },
  "daily-cap": { en: "today's outflows would have passed the daily cap", es: "las salidas de hoy pasarían el tope diario", "pt-br": "as saídas de hoje passariam o teto diário" },
  "signature-required": { en: "an amount above the threshold needed your signature", es: "un monto sobre el umbral necesitaba tu firma", "pt-br": "um valor acima do limite precisava da sua assinatura" },
};

type Maker = (v: (key: string) => string, l: (key: string) => string, lang: Lang) => string;

const SENTENCES: Record<ReceiptKind, Record<Lang, Maker>> = {
  split: {
    en: (v) => `Of the ${v("total")} that arrived: ${v("taxes")} to Taxes (${v("rate")}), ${v("payroll")} to Payroll, ${v("operating")} to Operating, ${v("emergency")} to Emergency, ${v("salary")} to Salary and ${v("profit")} to Profit.`,
    es: (v) => `De los ${v("total")} que llegaron: ${v("taxes")} a Impuestos (${v("rate")}), ${v("payroll")} a Nómina, ${v("operating")} a Operación, ${v("emergency")} a Emergencia, ${v("salary")} a Sueldo y ${v("profit")} a Ganancia.`,
    "pt-br": (v) => `Dos ${v("total")} que chegaram: ${v("taxes")} para Impostos (${v("rate")}), ${v("payroll")} para Folha, ${v("operating")} para Operação, ${v("emergency")} para Emergência, ${v("salary")} para Salário e ${v("profit")} para Lucro.`,
  },
  "taxes-recompute": {
    en: (v) => `I recomputed your tax reserve rate: it went from ${v("from")} to ${v("to")}.`,
    es: (v) => `Recalculé la tasa de tu reserva de impuestos: pasó de ${v("from")} a ${v("to")}.`,
    "pt-br": (v) => `Recalculei a taxa da sua reserva de impostos: passou de ${v("from")} para ${v("to")}.`,
  },
  "vault-sweep": {
    en: (v, l) => `I moved ${v("amount")} into the ${l("vault")} vault. Yield is variable and the value can go down.`,
    es: (v, l) => `Moví ${v("amount")} a la vault ${l("vault")}. El rendimiento es variable y el valor puede bajar.`,
    "pt-br": (v, l) => `Movi ${v("amount")} para a vault ${l("vault")}. O rendimento é variável e o valor pode cair.`,
  },
  "vault-redeem": {
    en: (v, l) => `I took ${v("amount")} out of the ${l("vault")} vault to have it ready in time.`,
    es: (v, l) => `Saqué ${v("amount")} de la vault ${l("vault")} para tenerlo listo a tiempo.`,
    "pt-br": (v, l) => `Retirei ${v("amount")} da vault ${l("vault")} para ter o valor pronto a tempo.`,
  },
  "emergency-sweep": {
    en: (v) => `Your operating cash was above its target, so I moved the surplus ${v("amount")} to your emergency fund.`,
    es: (v) => `Tu caja de operación superaba su meta, así que moví el excedente de ${v("amount")} a tu fondo de emergencia.`,
    "pt-br": (v) => `Seu caixa de operação estava acima da meta, então movi o excedente de ${v("amount")} para o fundo de emergência.`,
  },
  salary: {
    en: (v) => `I paid your salary: ${v("amount")}.`,
    es: (v) => `Pagué tu sueldo: ${v("amount")}.`,
    "pt-br": (v) => `Paguei seu salário: ${v("amount")}.`,
  },
  "salary-trim": {
    en: (v, l, lang) => `I paid ${v("paid")} of your ${v("owed")} salary; ${v("pending")} stays pending because ${REASONS[l("reason")]?.[lang] ?? l("reason")}.`,
    es: (v, l, lang) => `Pagué ${v("paid")} de tu sueldo de ${v("owed")}; ${v("pending")} queda pendiente porque ${REASONS[l("reason")]?.[lang] ?? l("reason")}.`,
    "pt-br": (v, l, lang) => `Paguei ${v("paid")} do seu salário de ${v("owed")}; ${v("pending")} fica pendente porque ${REASONS[l("reason")]?.[lang] ?? l("reason")}.`,
  },
  "salary-raise-proposal": {
    en: (v) => `You have kept your cushion above target, so I propose raising your salary from ${v("from")} to ${v("to")}. It only changes if you approve.`,
    es: (v) => `Mantuviste tu colchón sobre la meta, así que propongo subir tu sueldo de ${v("from")} a ${v("to")}. Solo cambia si lo apruebas.`,
    "pt-br": (v) => `Você manteve sua reserva acima da meta, então proponho aumentar seu salário de ${v("from")} para ${v("to")}. Só muda se você aprovar.`,
  },
  payment: {
    en: (v, l) => `I paid ${v("amount")} to ${l("to")}.`,
    es: (v, l) => `Pagué ${v("amount")} a ${l("to")}.`,
    "pt-br": (v, l) => `Paguei ${v("amount")} para ${l("to")}.`,
  },
  "payment-proposal": {
    en: (v, l) => `I propose paying ${v("amount")} to ${l("to")}. I will not do it unless you approve.`,
    es: (v, l) => `Propongo pagar ${v("amount")} a ${l("to")}. No lo haré si no lo apruebas.`,
    "pt-br": (v, l) => `Proponho pagar ${v("amount")} para ${l("to")}. Não farei isso sem a sua aprovação.`,
  },
  "taxes-to-local": {
    en: (v, l) => `I converted ${v("amount")} of your tax reserve to ${l("currency")} ahead of the due date.`,
    es: (v, l) => `Convertí ${v("amount")} de tu reserva de impuestos a ${l("currency")} antes del vencimiento.`,
    "pt-br": (v, l) => `Converti ${v("amount")} da sua reserva de impostos para ${l("currency")} antes do vencimento.`,
  },
  "taxes-to-local-proposal": {
    en: (v, l) => `I propose converting ${v("amount")} of your tax reserve to ${l("currency")} before the due date. I will not do it unless you approve.`,
    es: (v, l) => `Propongo convertir ${v("amount")} de tu reserva de impuestos a ${l("currency")} antes del vencimiento. No lo haré si no lo apruebas.`,
    "pt-br": (v, l) => `Proponho converter ${v("amount")} da sua reserva de impostos para ${l("currency")} antes do vencimento. Não farei isso sem a sua aprovação.`,
  },
  move: {
    en: (v, l) => `I moved ${v("amount")} from ${l("from")} to ${l("to")}.`,
    es: (v, l) => `Moví ${v("amount")} de ${l("from")} a ${l("to")}.`,
    "pt-br": (v, l) => `Movi ${v("amount")} de ${l("from")} para ${l("to")}.`,
  },
  "proposal-cancelled": {
    en: (_v, l) => `I cancelled the pending proposal: ${l("what")}. Nothing changed.`,
    es: (_v, l) => `Cancelé la propuesta pendiente: ${l("what")}. No cambió nada.`,
    "pt-br": (_v, l) => `Cancelei a proposta pendente: ${l("what")}. Nada mudou.`,
  },
  "structural-change-proposal": {
    en: (_v, l) => `I propose a change to how your boxes work: ${l("change")}. Nothing changes unless you approve.`,
    es: (_v, l) => `Propongo un cambio en cómo funcionan tus cajitas: ${l("change")}. Nada cambia si no lo apruebas.`,
    "pt-br": (_v, l) => `Proponho uma mudança em como suas caixinhas funcionam: ${l("change")}. Nada muda sem a sua aprovação.`,
  },
  "breaker-halt": {
    en: (_v, l, lang) => `I stopped acting on my own because a safety check failed: ${HALT_REASONS[l("reason")]?.[lang] ?? l("reason")}. Your money and your controls are unchanged.`,
    es: (_v, l, lang) => `Dejé de actuar por mi cuenta porque falló una verificación de seguridad: ${HALT_REASONS[l("reason")]?.[lang] ?? l("reason")}. Tu dinero y tus controles no cambiaron.`,
    "pt-br": (_v, l, lang) => `Parei de agir por conta própria porque uma verificação de segurança falhou: ${HALT_REASONS[l("reason")]?.[lang] ?? l("reason")}. Seu dinheiro e seus controles não mudaram.`,
  },
  "breaker-reset": {
    en: (_v, l) => `${l("actor")} confirmed the safety check and I resumed.`,
    es: (_v, l) => `${l("actor")} confirmó la verificación de seguridad y reanudé.`,
    "pt-br": (_v, l) => `${l("actor")} confirmou a verificação de segurança e eu retomei.`,
  },
};

/** The deterministic explanation: only the engine's facts, formatted for the language and number style. */
export function template(facts: Facts, lang: Lang, style: NumberStyle): string {
  const keys = TEMPLATE_KEYS[facts.kind];
  if (!keys) throw new RangeError(`unknown kind ${String(facts.kind)}`);
  const v = (key: string): string => {
    const fact = facts.values[key];
    if (!fact) throw new RangeError(`${facts.kind}: the fact "${key}" is missing`);
    return formatFact(fact, lang, style);
  };
  const l = (key: string): string => {
    const label = facts.labels[key];
    if (label === undefined) throw new RangeError(`${facts.kind}: the label "${key}" is missing`);
    return label;
  };
  return SENTENCES[facts.kind][lang](v, l, lang);
}
