import type { PlainDate } from "@strickle/core";

export type Lang = "en" | "es" | "pt-br";
export type NumberStyle = "en-US" | "es-MX" | "es-CO" | "es-AR" | "pt-BR";
export type ReceiptKind =
  | "split" | "taxes-recompute" | "vault-sweep" | "vault-redeem" | "emergency-sweep"
  | "salary" | "salary-trim" | "salary-raise-proposal" | "payment" | "payment-proposal"
  | "taxes-to-local" | "taxes-to-local-proposal" | "structural-change-proposal" | "breaker-halt" | "breaker-reset"
  | "move" | "proposal-cancelled"
  | "early-payment" | "early-payment-proposal"
  | "income-doubt" | "reclassified"
  | "swap" | "swap-held"
  | "earn" | "earn-back" | "earn-held" | "yield-exit";

export type FactValue =
  | { type: "amount"; units: bigint; decimals: number; symbol: string }
  | { type: "bps"; value: number }
  | { type: "sbps"; value: number }
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
    case "sbps": {
      if (!Number.isInteger(value.value)) throw new RangeError(`sbps must be an integer, got ${value.value}`);
      const magnitude = formatFact({ type: "bps", value: Math.abs(value.value) }, lang, style);
      return value.value > 0 ? `+${magnitude}` : value.value < 0 ? `-${magnitude}` : magnitude;
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
  "early-payment": { values: ["net", "discount", "apr"], labels: ["to"] },
  "early-payment-proposal": { values: ["net", "discount", "apr"], labels: ["to"] },
  "breaker-halt": { values: [], labels: ["reason"] },
  "breaker-reset": { values: [], labels: ["actor"] },
  "income-doubt": { values: ["amount"], labels: ["flag"] },
  reclassified: { values: ["amount"], labels: ["from", "to"] },
  swap: { values: ["amount", "expectedOut", "minOut", "reference", "deviation", "fee"], labels: ["label", "direction"] },
  "swap-held": { values: [], labels: ["label", "currency", "reason"] },
  earn: { values: ["amount", "apy"], labels: ["label", "vault", "protocol"] },
  "earn-back": { values: ["amount"], labels: ["label", "vault", "protocol"] },
  "earn-held": { values: [], labels: ["label", "vault", "reason"] },
  "yield-exit": { values: [], labels: ["label", "vault", "reason"] },
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

const DOUBT_REASONS: Record<string, Record<Lang, string>> = {
  "own-address": { en: "It came from an address you may own", es: "Vino de una dirección que quizá es tuya", "pt-br": "Veio de um endereço que talvez seja seu" },
  "outlier-size": { en: "It is much larger than your usual payments", es: "Es mucho mayor que tus pagos habituales", "pt-br": "É muito maior que seus pagamentos habituais" },
  "amount-matches-outflow": { en: "It is the same amount you sent out earlier", es: "Es el mismo monto que enviaste antes", "pt-br": "É o mesmo valor que você enviou antes" },
  unattributed: { en: "We could not see who sent it", es: "No pudimos ver quién lo envió", "pt-br": "Não conseguimos ver quem enviou" },
};

const CLASS_NAMES: Record<string, Record<Lang, string>> = {
  income: { en: "income", es: "ingreso", "pt-br": "renda" },
  "own-transfer": { en: "your own money", es: "tu propio dinero", "pt-br": "seu próprio dinheiro" },
  refund: { en: "a refund", es: "un reembolso", "pt-br": "um reembolso" },
};

const SWAP_REASONS: Record<string, Record<Lang, string>> = {
  "worse-than-reference": { en: "the price offered was worse than the market reference", es: "el precio ofrecido fue peor que la referencia del mercado", "pt-br": "o preço oferecido foi pior que a referência do mercado" },
  "better-than-reference": { en: "the price offered was too good to be true against the market reference", es: "el precio ofrecido era demasiado bueno frente a la referencia del mercado", "pt-br": "o preço oferecido era bom demais frente à referência do mercado" },
  "stale-feed": { en: "the price feed is out of date", es: "la fuente de precios está desactualizada", "pt-br": "a fonte de preços está desatualizada" },
  "adapter-not-approved": { en: "the conversion service is not active on your account yet", es: "el servicio de conversión aún no está activo en tu cuenta", "pt-br": "o serviço de conversão ainda não está ativo na sua conta" },
  failures: { en: "three attempts in a row failed", es: "tres intentos seguidos fallaron", "pt-br": "três tentativas seguidas falharam" },
  "daily-cap": { en: "today's conversion limit is used", es: "el límite de conversión de hoy ya se usó", "pt-br": "o limite de conversão de hoje já foi usado" },
  "invalid-quote": { en: "the answer from the conversion service did not pass its checks", es: "la respuesta del servicio de conversión no pasó sus verificaciones", "pt-br": "a resposta do serviço de conversão não passou nas verificações" },
  "vault-refused": { en: "your vault refused the conversion under its own limits", es: "tu vault rechazó la conversión según sus propios límites", "pt-br": "seu vault recusou a conversão pelos próprios limites" },
  "quote-unavailable": { en: "the conversion service did not answer", es: "el servicio de conversión no respondió", "pt-br": "o serviço de conversão não respondeu" },
};

const EARN_REASONS: Record<string, Record<Lang, string>> = {
  "adapter-not-approved": { en: "the agent's service is not active on your account yet, which takes a day after you approve it", es: "el servicio del agente aún no está activo en tu cuenta, lo cual tarda un día tras aprobarlo", "pt-br": "o serviço do agente ainda não está ativo na sua conta, o que leva um dia após você aprovar" },
  "vault-not-approved": { en: "this vault is not approved on your account yet, which takes a day after you approve it", es: "esta vault aún no está aprobada en tu cuenta, lo cual tarda un día tras aprobarla", "pt-br": "este vault ainda não está aprovado na sua conta, o que leva um dia após você aprovar" },
  "quote-unavailable": { en: "Circle's service did not answer", es: "el servicio de Circle no respondió", "pt-br": "o serviço da Circle não respondeu" },
  "invalid-bundle": { en: "Circle's answer did not match what was asked, so the agent refused it", es: "la respuesta de Circle no coincidía con lo pedido, así que el agente la rechazó", "pt-br": "a resposta da Circle não correspondia ao pedido, então o agente a recusou" },
  "vault-refused": { en: "your vault refused it under its own limits", es: "tu vault lo rechazó según sus propios límites", "pt-br": "seu vault recusou conforme seus próprios limites" },
  failures: { en: "it failed three times in a row, so ask again when you want to retry", es: "falló tres veces seguidas, así que vuelve a pedirlo cuando quieras reintentar", "pt-br": "falhou três vezes seguidas, então peça de novo quando quiser tentar outra vez" },
  insufficient: { en: "the box does not hold that much", es: "la cajita no tiene tanto", "pt-br": "a caixinha não tem tanto" },
  expired: { en: "it was not carried out within a day", es: "no se llevó a cabo en un día", "pt-br": "não foi executado em um dia" },
};

const EXIT_REASONS: Record<string, Record<Lang, string>> = {
  "price-drop": { en: "its share price fell", es: "el precio de su participación bajó", "pt-br": "o preço da sua cota caiu" },
  "rate-spike": { en: "its rate jumped to an unusual level", es: "su tasa saltó a un nivel inusual", "pt-br": "sua taxa saltou para um nível incomum" },
  inactive: { en: "it stopped accepting money", es: "dejó de aceptar dinero", "pt-br": "deixou de aceitar dinheiro" },
  illiquid: { en: "it no longer holds enough to pay everyone back at once", es: "ya no tiene lo suficiente para devolver a todos a la vez", "pt-br": "não tem mais o suficiente para devolver a todos de uma vez" },
};

const CURRENCY_NAMES: Record<string, Record<Lang, string>> = {
  EUR: { en: "euros", es: "euros", "pt-br": "euros" },
  USD: { en: "dollars", es: "dólares", "pt-br": "dólares" },
};

/** What a conversion turns the money into; an unknown direction is written as it came, never guessed. */
const DIRECTIONS: Record<string, Record<Lang, string>> = {
  "to-euros": CURRENCY_NAMES.EUR as Record<Lang, string>,
  "to-dollars": CURRENCY_NAMES.USD as Record<Lang, string>,
};
const into = (direction: string, lang: Lang): string => DIRECTIONS[direction]?.[lang] ?? direction;

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
  "early-payment": {
    en: (v, l) => `I paid ${l("to")} ${v("net")} today instead of at the due date and saved ${v("discount")}, about ${v("apr")} a year. Your cushion stays above its floor.`,
    es: (v, l) => `Le pagué a ${l("to")} ${v("net")} hoy en vez de en el vencimiento y ahorré ${v("discount")}, cerca de ${v("apr")} al año. Tu colchón sigue por encima de su piso.`,
    "pt-br": (v, l) => `Paguei ${v("net")} a ${l("to")} hoje em vez de no vencimento e economizei ${v("discount")}, cerca de ${v("apr")} ao ano. Sua reserva continua acima do piso.`,
  },
  "early-payment-proposal": {
    en: (v, l) => `I propose paying ${l("to")} ${v("net")} early to save ${v("discount")}, about ${v("apr")} a year. Your cushion would stay above its floor. I will not do it unless you approve.`,
    es: (v, l) => `Propongo pagarle a ${l("to")} ${v("net")} antes para ahorrar ${v("discount")}, cerca de ${v("apr")} al año. Tu colchón seguiría por encima de su piso. No lo haré si no lo apruebas.`,
    "pt-br": (v, l) => `Proponho pagar ${v("net")} a ${l("to")} antes para economizar ${v("discount")}, cerca de ${v("apr")} ao ano. Sua reserva continuaria acima do piso. Não farei isso sem a sua aprovação.`,
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
  "income-doubt": {
    en: (v, l, lang) => `${v("amount")} arrived and was split as income. ${DOUBT_REASONS[l("flag")]?.[lang] ?? l("flag")}: if it was your own money moving, say so and the taxes set aside for it stay put until your next tax date.`,
    es: (v, l, lang) => `${v("amount")} llegaron y se repartieron como ingreso. ${DOUBT_REASONS[l("flag")]?.[lang] ?? l("flag")}: si era tu propio dinero moviéndose, dilo y los impuestos apartados para él se quedan quietos hasta tu próxima fecha de pago.`,
    "pt-br": (v, l, lang) => `${v("amount")} chegaram e foram divididos como renda. ${DOUBT_REASONS[l("flag")]?.[lang] ?? l("flag")}: se era seu próprio dinheiro se movendo, avise e os impostos separados para ele ficam parados até a próxima data de pagamento.`,
  },
  reclassified: {
    en: (v, l, lang) => `You marked ${v("amount")} as ${CLASS_NAMES[l("to")]?.[lang] ?? l("to")} instead of ${CLASS_NAMES[l("from")]?.[lang] ?? l("from")}. Taxes already set aside for it stay in your taxes box until your next tax date; if it turns out to be income, the next payments set aside what is missing.`,
    es: (v, l, lang) => `Marcaste ${v("amount")} como ${CLASS_NAMES[l("to")]?.[lang] ?? l("to")} en lugar de ${CLASS_NAMES[l("from")]?.[lang] ?? l("from")}. Los impuestos ya apartados para ese dinero se quedan en tu caja de impuestos hasta tu próxima fecha de pago; si resulta ser ingreso, los próximos pagos apartan lo que falte.`,
    "pt-br": (v, l, lang) => `Você marcou ${v("amount")} como ${CLASS_NAMES[l("to")]?.[lang] ?? l("to")} em vez de ${CLASS_NAMES[l("from")]?.[lang] ?? l("from")}. Os impostos já separados para esse dinheiro ficam na sua caixa de impostos até a próxima data de pagamento; se for renda, os próximos pagamentos separam o que faltar.`,
  },
  swap: {
    en: (v, l, lang) => `Your ${l("label")} box is paid in ${into(l("direction"), lang)}, so ${v("amount")} were converted to ${into(l("direction"), lang)}. The agent expected ${v("expectedOut")}, accepted nothing worse than ${v("minOut")}, and the market reference was ${v("reference")} (a difference of ${v("deviation")}). Fees: ${v("fee")}.`,
    es: (v, l, lang) => `Tu cajita ${l("label")} se paga en ${into(l("direction"), lang)}, así que se convirtieron ${v("amount")} a ${into(l("direction"), lang)}. El agente esperaba ${v("expectedOut")}, no aceptó nada peor que ${v("minOut")}, y la referencia del mercado era ${v("reference")} (una diferencia de ${v("deviation")}). Comisiones: ${v("fee")}.`,
    "pt-br": (v, l, lang) => `Sua caixinha ${l("label")} é paga em ${into(l("direction"), lang)}, então ${v("amount")} foram convertidos em ${into(l("direction"), lang)}. O agente esperava ${v("expectedOut")}, não aceitou nada pior que ${v("minOut")}, e a referência do mercado era ${v("reference")} (uma diferença de ${v("deviation")}). Taxas: ${v("fee")}.`,
  },
  "swap-held": {
    en: (_v, l, lang) => `Conversions to ${CURRENCY_NAMES[l("currency")]?.[lang] ?? l("currency")} for your ${l("label")} box are paused: ${SWAP_REASONS[l("reason")]?.[lang] ?? l("reason")}. Your money stays in ${CURRENCY_NAMES[l("currency") === "EUR" ? "USD" : "EUR"]?.[lang]} and everything else keeps working.`,
    es: (_v, l, lang) => `Las conversiones a ${CURRENCY_NAMES[l("currency")]?.[lang] ?? l("currency")} para tu cajita ${l("label")} están en pausa: ${SWAP_REASONS[l("reason")]?.[lang] ?? l("reason")}. Tu dinero se queda en ${CURRENCY_NAMES[l("currency") === "EUR" ? "USD" : "EUR"]?.[lang]} y todo lo demás sigue funcionando.`,
    "pt-br": (_v, l, lang) => `As conversões para ${CURRENCY_NAMES[l("currency")]?.[lang] ?? l("currency")} da sua caixinha ${l("label")} estão pausadas: ${SWAP_REASONS[l("reason")]?.[lang] ?? l("reason")}. Seu dinheiro fica em ${CURRENCY_NAMES[l("currency") === "EUR" ? "USD" : "EUR"]?.[lang]} e todo o resto continua funcionando.`,
  },
  earn: {
    en: (v, l) => `Your ${l("label")} box put ${v("amount")} to work in ${l("vault")} (${l("protocol")}, ${v("apy")} a year when it started). The rate changes and the value can go down; you can take it back at any time.`,
    es: (v, l) => `Tu cajita ${l("label")} puso ${v("amount")} a trabajar en ${l("vault")} (${l("protocol")}, ${v("apy")} al año al empezar). La tasa cambia y el valor puede bajar; puedes retirarlo cuando quieras.`,
    "pt-br": (v, l) => `Sua caixinha ${l("label")} colocou ${v("amount")} para trabalhar em ${l("vault")} (${l("protocol")}, ${v("apy")} ao ano no início). A taxa muda e o valor pode cair; você pode retirar quando quiser.`,
  },
  "earn-back": {
    en: (v, l) => `Your ${l("label")} box took ${v("amount")} back from ${l("vault")} (${l("protocol")}).`,
    es: (v, l) => `Tu cajita ${l("label")} retiró ${v("amount")} de ${l("vault")} (${l("protocol")}).`,
    "pt-br": (v, l) => `Sua caixinha ${l("label")} retirou ${v("amount")} de ${l("vault")} (${l("protocol")}).`,
  },
  "earn-held": {
    en: (_v, l, lang) => `Your ${l("label")} box's move with ${l("vault")} is on hold: ${EARN_REASONS[l("reason")]?.[lang] ?? l("reason")}. Your money stays where it is and everything else keeps working.`,
    es: (_v, l, lang) => `El movimiento de tu cajita ${l("label")} con ${l("vault")} está en pausa: ${EARN_REASONS[l("reason")]?.[lang] ?? l("reason")}. Tu dinero se queda donde está y todo lo demás sigue funcionando.`,
    "pt-br": (_v, l, lang) => `O movimento da sua caixinha ${l("label")} com ${l("vault")} está em pausa: ${EARN_REASONS[l("reason")]?.[lang] ?? l("reason")}. Seu dinheiro fica onde está e todo o resto continua funcionando.`,
  },
  "yield-exit": {
    en: (_v, l, lang) => `Your ${l("label")} box's money was taken out of ${l("vault")} because ${EXIT_REASONS[l("reason")]?.[lang] ?? l("reason")}. It is back in your box as cash; to put it to work again, ask for it.`,
    es: (_v, l, lang) => `El dinero de tu cajita ${l("label")} se sacó de ${l("vault")} porque ${EXIT_REASONS[l("reason")]?.[lang] ?? l("reason")}. Volvió a tu cajita como efectivo; para ponerlo a trabajar otra vez, pídelo.`,
    "pt-br": (_v, l, lang) => `O dinheiro da sua caixinha ${l("label")} foi retirado de ${l("vault")} porque ${EXIT_REASONS[l("reason")]?.[lang] ?? l("reason")}. Voltou para a sua caixinha em dinheiro; para colocá-lo para trabalhar de novo, peça.`,
  },
  "breaker-reset": {
    en: (_v, l) => `${l("actor")} confirmed the safety check and I resumed.`,
    es: (_v, l) => `${l("actor")} confirmó la verificación de seguridad y reanudé.`,
    "pt-br": (_v, l) => `${l("actor")} confirmou a verificação de segurança e eu retomei.`,
  },
};

function sentence(facts: Facts, lang: Lang, value: (key: string) => string): string {
  const keys = TEMPLATE_KEYS[facts.kind];
  if (!keys) throw new RangeError(`unknown kind ${String(facts.kind)}`);
  const l = (key: string): string => {
    const label = facts.labels[key];
    if (label === undefined) throw new RangeError(`${facts.kind}: the label "${key}" is missing`);
    return label;
  };
  return SENTENCES[facts.kind][lang](value, l, lang);
}

const present = (facts: Facts, key: string): FactValue => {
  const fact = facts.values[key];
  if (!fact) throw new RangeError(`${facts.kind}: the fact "${key}" is missing`);
  return fact;
};

/** The deterministic explanation: only the engine's facts, formatted for the language and number style. */
export function template(facts: Facts, lang: Lang, style: NumberStyle): string {
  return sentence(facts, lang, (key) => formatFact(present(facts, key), lang, style));
}

/** The same sentence with each value left as a `{placeholder}`: the canonical text a model may rephrase, never extend. */
export function placeholderTemplate(facts: Facts, lang: Lang): string {
  return sentence(facts, lang, (key) => {
    present(facts, key);
    return `{${key}}`;
  });
}
