export function ttlCache<T>(ttlMs: number, now: () => number = Date.now, limit = 500) {
  const entries = new Map<string, { value: T; expires: number }>();
  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      entries.set(key, { value, expires: now() + ttlMs });
      if (entries.size > limit) entries.delete(entries.keys().next().value as string);
    },
  };
}
