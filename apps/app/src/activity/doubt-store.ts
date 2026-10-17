const key = (vault: string) => `strickle.doubts.v1:${vault.toLowerCase()}`;

/** Arrivals the person already told us were income; only a per-device convenience, the agent never reads it. */
export function loadAnswered(vault: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key(vault));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveAnswered(vault: string, answered: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(key(vault), JSON.stringify([...answered].slice(-200)));
  } catch {
    // storage may be blocked; the card then simply comes back on the next visit
  }
}
