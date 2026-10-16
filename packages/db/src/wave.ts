import type { Sql } from "postgres";

export type WaveEventInput = { kind: "opened"; tranche: number } | { kind: "incident" } | { kind: "resolved" };
export type WaveEventRow = { kind: "opened"; tranche: number; at: Date } | { kind: "incident"; at: Date } | { kind: "resolved"; at: Date };

/** `at` is when it happened, so the caller's clock and the stored events agree; it defaults to now. */
export async function recordWaveEvent(sql: Sql, event: WaveEventInput, at: Date = new Date()): Promise<void> {
  const tranche = event.kind === "opened" ? event.tranche : null;
  await sql`insert into wave_events (kind, tranche, at) values (${event.kind}, ${tranche}, ${at})`;
}

/** Oldest first. */
export async function waveEvents(sql: Sql): Promise<WaveEventRow[]> {
  const rows = await sql<{ kind: "opened" | "incident" | "resolved"; tranche: number | null; at: Date }[]>`select kind, tranche, at from wave_events order by id`;
  return rows.map((row) => (row.kind === "opened" ? { kind: "opened", tranche: row.tranche as number, at: row.at } : { kind: row.kind, at: row.at }));
}

/** Seats already handed out: every invitation ever issued, redeemed or not. Seats whose label starts with `team` count against the team's share. */
export async function issuedCounts(sql: Sql): Promise<{ team: number; organic: number }> {
  const [row] = await sql<{ team: string; organic: string }[]>`
    select count(*) filter (where label like 'team%') as team, count(*) filter (where label not like 'team%') as organic from invites`;
  return { team: Number(row?.team ?? 0), organic: Number(row?.organic ?? 0) };
}
