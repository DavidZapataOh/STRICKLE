import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "postgres";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newInviteCode(): string {
  let bits = 0n;
  for (const byte of randomBytes(10)) bits = (bits << 8n) | BigInt(byte);
  let code = "";
  for (let shift = 75; shift >= 0; shift -= 5) code += ALPHABET.charAt(Number((bits >> BigInt(shift)) & 31n));
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12)}`;
}

export const normalizeInvite = (code: string): string =>
  code.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

const hashInvite = (code: string): string => createHash("sha256").update(normalizeInvite(code)).digest("hex");

export async function createInvites(sql: Sql, label: string, count: number): Promise<string[]> {
  const codes = Array.from({ length: count }, newInviteCode);
  for (const code of codes) await sql`insert into invites (code_hash, label) values (${hashInvite(code)}, ${label})`;
  return codes;
}

/** The code is burned and its session stored in one transaction: a failure to store the session leaves the code usable. */
export async function redeemInviteWithSession(sql: Sql, code: string, session: { sid: string; expiresAt: Date }): Promise<boolean> {
  if (normalizeInvite(code) === "") return false;
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`update invites set redeemed_at = now() where code_hash = ${hashInvite(code)} and redeemed_at is null returning id`;
    const invite = rows[0];
    if (!invite) return false;
    await tx`insert into access_sessions (sid, invite_id, expires_at) values (${session.sid}, ${invite.id}, ${session.expiresAt})`;
    return true;
  });
}

/** Ends the live sessions of an invitation label and burns its codes nobody has redeemed, so a leaked batch is dead on both counts. Returns the sessions ended. */
export async function revokeInvites(sql: Sql, label: string): Promise<number> {
  await sql`update invites set redeemed_at = now() where label = ${label} and redeemed_at is null`;
  const rows = await sql`update access_sessions set revoked_at = now() where revoked_at is null and expires_at > now() and invite_id in (select id from invites where label = ${label}) returning sid`;
  return rows.length;
}

export async function revokeSession(sql: Sql, sid: string): Promise<boolean> {
  const rows = await sql`update access_sessions set revoked_at = now() where sid = ${sid} and revoked_at is null returning sid`;
  return rows.length === 1;
}

export async function sessionActive(sql: Sql, sid: string, now: Date): Promise<boolean> {
  const rows = await sql`select 1 from access_sessions where sid = ${sid} and revoked_at is null and expires_at > ${now}`;
  return rows.length === 1;
}

export async function inviteStats(sql: Sql): Promise<{ total: number; redeemed: number }> {
  const [row] = await sql<{ total: string; redeemed: string }[]>`select count(*) as total, count(redeemed_at) as redeemed from invites`;
  return { total: Number(row?.total ?? 0), redeemed: Number(row?.redeemed ?? 0) };
}
