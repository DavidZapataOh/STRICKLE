export function isPasskeyCancelled(error: unknown): boolean {
  const text = `${(error as { name?: string })?.name ?? ""} ${(error as { message?: string })?.message ?? String(error ?? "")}`;
  return /NotAllowed|AbortError|cancel|dismiss/i.test(text);
}
