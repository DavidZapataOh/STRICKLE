import type { BoxRule } from "./vault.ts";

export type RuleLine =
  | { key: "locked"; until: number }
  | { key: "always"; hours: number }
  | { key: "below"; floor: bigint; hours: number }
  | { key: "restricted" }
  | { key: "free" };

export function describeRule(rule: BoxRule, now: number): RuleLine[] {
  if (rule.lockedUntil > now) return [{ key: "locked", until: rule.lockedUntil }];
  const hours = Math.round(rule.delaySeconds / 3600);
  const lines: RuleLine[] = [];
  if (rule.alwaysDelayed && hours > 0) lines.push({ key: "always", hours });
  else if (rule.floor > 0n && hours > 0) lines.push({ key: "below", floor: rule.floor, hours });
  if (rule.restricted) lines.push({ key: "restricted" });
  return lines.length > 0 ? lines : [{ key: "free" }];
}
