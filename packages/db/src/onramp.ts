import type { Sql, TransactionSql } from "postgres";

export interface OnrampSessionRow {
  id: string;
  linkId: string;
  vault: string;
  circleSessionId: string | null;
  status: "minted" | "settled" | "unresolved";
  settledTx: string | null;
  createdAt: Date;
  expiresAt: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  link_id: string;
  vault: string;
  circle_session_id: string | null;
  status: string;
  settled_tx: string | null;
  created_at: Date;
  expires_at: Date;
}

const toRow = (row: Row): OnrampSessionRow => ({ id: row.id, linkId: row.link_id, vault: row.vault, circleSessionId: row.circle_session_id, status: row.status as OnrampSessionRow["status"], settledTx: row.settled_tx, createdAt: row.created_at, expiresAt: row.expires_at });

/** Our id is the appUserId handed to Circle, so a notification can be tied back to the link that minted it. */
export async function createOnrampSessionRow(sql: Sql, input: { linkId: string; vault: string; expiresAt: Date }): Promise<string> {
  const [row] = await sql<{ id: string }[]>`insert into onramp_sessions (link_id, vault, expires_at) values (${input.linkId}, ${input.vault.toLowerCase()}, ${input.expiresAt}) returning id`;
  if (!row) throw new Error("onramp session: no row returned");
  return row.id;
}

export async function attachCircleSession(sql: Sql, id: string, circleSessionId: string): Promise<void> {
  await sql`update onramp_sessions set circle_session_id = ${circleSessionId} where id = ${id}`;
}

export async function findOnrampSession(sql: Sql, keys: { id?: string; circleSessionId?: string }): Promise<OnrampSessionRow | null> {
  if (keys.id !== undefined) {
    if (!UUID.test(keys.id)) return null;
    const [row] = await sql<Row[]>`select * from onramp_sessions where id = ${keys.id}`;
    return row ? toRow(row) : null;
  }
  if (keys.circleSessionId !== undefined) {
    const [row] = await sql<Row[]>`select * from onramp_sessions where circle_session_id = ${keys.circleSessionId}`;
    return row ? toRow(row) : null;
  }
  return null;
}

export async function settleOnrampSession(sql: Sql | TransactionSql, id: string, txHash: string): Promise<boolean> {
  const rows = await sql`update onramp_sessions set status = 'settled', settled_tx = ${txHash.toLowerCase()} where id = ${id} and status in ('minted', 'unresolved') returning id`;
  return rows.length === 1;
}

export async function openSessionsFor(sql: Sql, vault: string, since: Date): Promise<OnrampSessionRow[]> {
  const rows = await sql<Row[]>`select * from onramp_sessions where status = 'minted' and created_at >= ${since} and vault = ${vault.toLowerCase()} order by created_at desc`;
  return rows.map(toRow);
}

/** The first delivery claims a notification. A repeat is a duplicate only once the first was applied; while it may still be running it is in flight, and a claim that never finished (a crash, a timeout) is taken over after two minutes, so a lost attempt cannot lose the credit. */
export async function recordWebhook(sql: Sql, input: { notificationId: string; type: string; payload: unknown }): Promise<"new" | "duplicate" | "in-flight"> {
  const claimed = await sql`insert into circle_webhook_events (notification_id, type, payload) values (${input.notificationId}, ${input.type}, ${sql.json(input.payload as never)})
    on conflict (notification_id) do update set received_at = now(), payload = excluded.payload
    where circle_webhook_events.applied_at is null and circle_webhook_events.received_at < now() - interval '2 minutes'
    returning notification_id`;
  if (claimed.length === 1) return "new";
  const [row] = await sql<{ applied_at: Date | null }[]>`select applied_at from circle_webhook_events where notification_id = ${input.notificationId}`;
  return row?.applied_at ? "duplicate" : "in-flight";
}

export async function markWebhookApplied(sql: Sql, notificationId: string): Promise<void> {
  await sql`update circle_webhook_events set applied_at = now() where notification_id = ${notificationId}`;
}

/** A notification for a known session that cannot be applied: kept visible so a corrected parser can find it, and still settleable later. */
export async function markSessionUnresolved(sql: Sql, id: string): Promise<void> {
  await sql`update onramp_sessions set status = 'unresolved' where id = ${id} and status = 'minted'`;
}

/** Called when applying a verified event failed for a reason that may pass: the next delivery must be treated as new. */
export async function releaseWebhook(sql: Sql, notificationId: string): Promise<void> {
  await sql`delete from circle_webhook_events where notification_id = ${notificationId}`;
}
