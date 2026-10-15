/** Serializes only allow-listed scalar fields and masks emails and long digit runs in free text. */
export function minimize(input: unknown, allow: readonly string[]): Record<string, string> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("expected an object");
  const out: Record<string, string> = {};
  for (const key of allow) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string") out[key] = value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]").replace(/\d{8,}/g, "[number]");
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  }
  return out;
}
