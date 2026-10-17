import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { type Facts, type Lang, type NumberStyle, type ReceiptKind, template } from "./templates.ts";

export type UndoHow = "redeem" | "sweep" | "move-back" | "restore-rate" | "cancel-proposal" | "reclassify-back";
export type UndoSummary = { undoable: true; how: UndoHow } | { undoable: false; reason: string };

export interface Receipt {
  id: string;
  kind: ReceiptKind;
  ruleId: string;
  facts: Facts;
  texts: Record<Lang, string>;
  styles: Record<Lang, NumberStyle>;
  undo: UndoSummary;
  createdAt: number;
  /** A counter the caller keeps per user, so two identical actions in the same second still have different ids. */
  sequence: number;
  undoes?: string;
}

const isPlainDate = (value: unknown): value is { year: number; month: number; day: number } =>
  typeof value === "object" && value !== null && "year" in value && "month" in value && "day" in value;

function canonical(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (isPlainDate(value)) return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/** Stable text of a value: keys sorted, bigints and dates written unambiguously. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

const IRREVERSIBLE: Partial<Record<ReceiptKind, string>> = {
  salary: "The salary has left your accounts, so it cannot be taken back.",
  "salary-trim": "The part of the salary that was paid has left your accounts, so it cannot be taken back.",
  payment: "The payment has left your accounts, so it cannot be taken back.",
  "taxes-to-local": "The conversion has been made, so it cannot be reverted.",
  "breaker-halt": "This records a safety stop; there is nothing to undo.",
  "breaker-reset": "This records a human reset; there is nothing to undo.",
  "early-payment": "The payment has left your accounts, so it cannot be taken back.",
  "income-doubt": "There is nothing to undo; you can mark it as your own money.",
  swap: "The conversion was made at that day's rate; to change it, set the box back to dollars and it converts back at the rate of that moment.",
  "swap-held": "There is nothing to undo; this only says why conversions paused.",
  earn: "The move was made at that moment's share price; to reverse it, take the money back out.",
  "earn-back": "The money is back in your box; to reverse it, put it to work again.",
  "earn-held": "There is nothing to undo; this only says why the move is on hold.",
  "yield-exit": "The money is back in your box; to put it to work again, ask for it.",
  split: "The money now sits in its boxes under their locks; it can be adjusted by moving between boxes, and the locks apply.",
};

const REVERSIBLE: Partial<Record<ReceiptKind, UndoHow>> = {
  "vault-sweep": "redeem",
  "vault-redeem": "sweep",
  "emergency-sweep": "move-back",
  "taxes-recompute": "restore-rate",
  "payment-proposal": "cancel-proposal",
  "salary-raise-proposal": "cancel-proposal",
  "structural-change-proposal": "cancel-proposal",
  "early-payment-proposal": "cancel-proposal",
  reclassified: "reclassify-back",
};

export function undoSummary(kind: ReceiptKind, undoes?: string): UndoSummary {
  if (undoes !== undefined) return { undoable: false, reason: "This receipt already undoes another action." };
  const how = REVERSIBLE[kind];
  if (how) return { undoable: true, how };
  return { undoable: false, reason: IRREVERSIBLE[kind] ?? "This action cannot be undone." };
}

const DEFAULT_STYLES: Record<Lang, NumberStyle> = { en: "en-US", es: "es-MX", "pt-br": "pt-BR" };
type Hashed = Pick<Receipt, "kind" | "ruleId" | "facts" | "createdAt" | "sequence" | "undoes">;
const hashed = (r: Hashed) => canonicalJson({ kind: r.kind, ruleId: r.ruleId, facts: r.facts, createdAt: r.createdAt, sequence: r.sequence, undoes: r.undoes ?? null });
const idOf = (r: Hashed) => bytesToHex(sha256(new TextEncoder().encode(hashed(r))));
const render = (facts: Facts, styles: Record<Lang, NumberStyle>): Record<Lang, string> => ({ en: template(facts, "en", styles.en), es: template(facts, "es", styles.es), "pt-br": template(facts, "pt-br", styles["pt-br"]) });

/** The kind of receipt each undo leaves: the counterpart action, so the text says what really happened. */
export const UNDO_KIND: Partial<Record<ReceiptKind, ReceiptKind>> = {
  "vault-sweep": "vault-redeem",
  "vault-redeem": "vault-sweep",
  "emergency-sweep": "move",
  "taxes-recompute": "taxes-recompute",
  "payment-proposal": "proposal-cancelled",
  "salary-raise-proposal": "proposal-cancelled",
  "structural-change-proposal": "proposal-cancelled",
  "early-payment-proposal": "proposal-cancelled",
  reclassified: "reclassified",
};

export function buildReceipt(input: { kind: ReceiptKind; ruleId: string; facts: Facts; createdAt: number; sequence: number; undoes?: string; styles?: Partial<Record<Lang, NumberStyle>> }): Receipt {
  if (input.ruleId.trim() === "") throw new RangeError("a receipt needs the id of the rule that acted");
  if (!Number.isInteger(input.createdAt) || input.createdAt < 0) throw new RangeError("createdAt must be a non-negative integer of epoch seconds");
  if (!Number.isInteger(input.sequence) || input.sequence < 0) throw new RangeError("sequence must be a non-negative integer");
  if (input.facts.kind !== input.kind) throw new RangeError(`the facts are of kind ${input.facts.kind}, not ${input.kind}`);
  const styles = { ...DEFAULT_STYLES, ...input.styles };
  const base = { kind: input.kind, ruleId: input.ruleId, facts: input.facts, createdAt: input.createdAt, sequence: input.sequence, undoes: input.undoes };
  return { id: idOf(base), ...base, texts: render(input.facts, styles), styles, undo: undoSummary(input.kind, input.undoes) };
}

/** True when the id still matches the hashed fields and the texts are exactly what the facts render to: any edit of a fact, the rule, the time, the link or a text is detected. */
export function verifyReceipt(receipt: Receipt): boolean {
  if (receipt.id !== idOf(receipt)) return false;
  const expected = render(receipt.facts, receipt.styles);
  return expected.en === receipt.texts.en && expected.es === receipt.texts.es && expected["pt-br"] === receipt.texts["pt-br"];
}
