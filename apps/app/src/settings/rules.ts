import type { BoxRule } from "../chain/vault.ts";

export const MIN_LOOSEN_DELAY_SECONDS = 86_400;

/** The vault's own comparison: a rule is "tighter" only when no field got looser. */
export const isTighter = (current: BoxRule, next: BoxRule): boolean =>
  next.delaySeconds >= current.delaySeconds &&
  (next.alwaysDelayed || !current.alwaysDelayed) &&
  (next.restricted || !current.restricted) &&
  next.floor >= current.floor &&
  next.lockedUntil >= current.lockedUntil;

export type RuleChangeKind = "immediate" | "delayed";

export const classifyRuleChange = (current: BoxRule, next: BoxRule): RuleChangeKind => (isTighter(current, next) ? "immediate" : "delayed");

export const loosenWaitSeconds = (current: BoxRule): number => Math.max(current.delaySeconds, MIN_LOOSEN_DELAY_SECONDS);

export const sameRule = (a: BoxRule, b: BoxRule): boolean =>
  a.delaySeconds === b.delaySeconds && a.alwaysDelayed === b.alwaysDelayed && a.restricted === b.restricted && a.floor === b.floor && a.lockedUntil === b.lockedUntil;
