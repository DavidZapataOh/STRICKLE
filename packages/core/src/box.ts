export const BOX_KINDS = ["taxes", "payroll", "salary", "operating", "emergency", "profit"] as const;
export type BoxKind = (typeof BOX_KINDS)[number];
