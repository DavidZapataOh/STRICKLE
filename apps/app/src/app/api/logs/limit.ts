/** A fixed-window counter per caller. It lives in one server instance's memory, so it bounds a single abusive client, not a distributed one: the shared cache in front of the route does the rest. */
export function rateLimit(max: number, windowMs: number, now: () => number = Date.now) {
  const seen = new Map<string, { count: number; resets: number }>();
  return (who: string): { allowed: boolean; retryAfterSeconds: number } => {
    const at = now();
    const entry = seen.get(who);
    if (!entry || entry.resets <= at) {
      seen.set(who, { count: 1, resets: at + windowMs });
      if (seen.size > 5_000) seen.delete(seen.keys().next().value as string);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= max, retryAfterSeconds: Math.ceil((entry.resets - at) / 1000) };
  };
}
