export const CATEGORIES = ["client-payment", "tax-payment", "payroll", "supplier", "software-subscription", "network-or-bank-fees", "own-transfer", "salary-withdrawal", "uncategorized"] as const;
export type Category = (typeof CATEGORIES)[number];

/** The model's answer must be a label of the closed list; anything else is `uncategorized`. */
export function classificationValid(raw: unknown): Category {
  if (typeof raw !== "object" || raw === null) return "uncategorized";
  const value = (raw as { category?: unknown }).category;
  if (typeof value !== "string") return "uncategorized";
  const label = value.trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(label) ? (label as Category) : "uncategorized";
}
