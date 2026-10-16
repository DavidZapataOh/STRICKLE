import type { Sql } from "postgres";

export function createLimiter(sql: Sql) {
  return {
    /** Counts one hit for the key in a fixed window and says whether it is within the limit. */
    async count(key: string, windowSeconds: number, limit: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
      const [row] = await sql<{ hits: number; wait: number }[]>`
        insert into rate_counters (key, window_start, hits) values (${key}, now(), 1)
        on conflict (key) do update set
          window_start = case when rate_counters.window_start <= now() - make_interval(secs => ${windowSeconds}::double precision) then now() else rate_counters.window_start end,
          hits = case when rate_counters.window_start <= now() - make_interval(secs => ${windowSeconds}::double precision) then 1 else rate_counters.hits + 1 end
        returning hits, extract(epoch from (window_start + make_interval(secs => ${windowSeconds}::double precision) - now()))::float8 as wait`;
      if (!row) throw new Error("limiter: no row returned");
      return { allowed: row.hits <= limit, retryAfterSeconds: Math.max(1, Math.ceil(row.wait)) };
    },

    /** Takes the key's single slot when its last claim is older than the interval; atomic across any number of callers. */
    async claimSlot(key: string, intervalSeconds: number): Promise<{ claimed: true; token: string } | { claimed: false; retryAfterSeconds: number }> {
      const [claimed] = await sql<{ token: string }[]>`
        insert into rate_slots (key, claimed_at) values (${key}, now())
        on conflict (key) do update set claimed_at = now()
        where rate_slots.claimed_at <= now() - make_interval(secs => ${intervalSeconds}::double precision)
        returning claimed_at::text as token`;
      if (claimed) return { claimed: true, token: claimed.token };
      const [row] = await sql<{ wait: number }[]>`
        select extract(epoch from (claimed_at + make_interval(secs => ${intervalSeconds}::double precision) - now()))::float8 as wait from rate_slots where key = ${key}`;
      return { claimed: false, retryAfterSeconds: Math.max(1, Math.ceil(row?.wait ?? intervalSeconds)) };
    },

    /** Gives the slot back, but only to the holder that claimed it (the token is the claim's own timestamp). */
    async releaseSlot(key: string, token: string): Promise<void> {
      await sql`delete from rate_slots where key = ${key} and claimed_at::text = ${token}`;
    },
  };
}
