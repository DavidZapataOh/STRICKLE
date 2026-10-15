import { randomUUID } from "node:crypto";
import { type Asset, type BoxKind, type Money, type PlainDate, formatPlainDate } from "@strickle/core";
import type { Sql } from "postgres";
import { decode, encode } from "./json.ts";
import { open, seal } from "./seal.ts";

export class StaleStateError extends Error {
  constructor(userId: string, expectedVersion: number) {
    super(`agent state of ${userId} is no longer at version ${expectedVersion}`);
    this.name = "StaleStateError";
  }
}

export type Locale = "en" | "es" | "pt-br";

function one<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`${what}: no row returned`);
  return row;
}

export function createStore(sql: Sql, key: Buffer) {
  const sealValue = (value: unknown, context: string) => seal(key, encode(value), context);
  const openValue = <T>(sealed: Uint8Array, context: string) => decode<T>(open(key, sealed, context));

  return {
    async createUser(user: { homeCountry: string; locale: Locale }): Promise<string> {
      const rows = await sql<{ id: string }[]>`
        insert into users (home_country, locale) values (${user.homeCountry}, ${user.locale}) returning id`;
      return one(rows, "createUser").id;
    },

    async setMirrorBalance(userId: string, kind: BoxKind, balance: Money): Promise<void> {
      const sealed = sealValue({ units: balance.units }, `mirror_boxes:${userId}:${kind}:${balance.asset}`);
      await sql`
        insert into mirror_boxes (user_id, kind, asset, balance)
        values (${userId}, ${kind}, ${balance.asset}, ${sealed})
        on conflict (user_id, kind, asset) do update set balance = excluded.balance, updated_at = now()`;
    },

    async getMirrorBalances(userId: string): Promise<{ kind: BoxKind; balance: Money }[]> {
      const rows = await sql<{ kind: BoxKind; asset: Asset; balance: Buffer }[]>`
        select kind, asset, balance from mirror_boxes where user_id = ${userId} order by kind, asset`;
      return rows.map((row) => ({
        kind: row.kind,
        balance: {
          asset: row.asset,
          units: openValue<{ units: bigint }>(row.balance, `mirror_boxes:${userId}:${row.kind}:${row.asset}`).units,
        },
      }));
    },

    async addReceipt(userId: string, kind: string, payload: unknown): Promise<string> {
      const id = randomUUID();
      const sealed = sealValue(payload, `receipts:${id}:${userId}`);
      await sql`insert into receipts (id, user_id, kind, payload) values (${id}, ${userId}, ${kind}, ${sealed})`;
      return id;
    },

    async listReceipts<T = unknown>(
      userId: string,
    ): Promise<{ id: string; kind: string; createdAt: Date; payload: T }[]> {
      const rows = await sql<{ id: string; kind: string; created_at: Date; payload: Buffer }[]>`
        select id, kind, created_at, payload from receipts where user_id = ${userId} order by created_at, id`;
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        createdAt: row.created_at,
        payload: openValue<T>(row.payload, `receipts:${row.id}:${userId}`),
      }));
    },

    async putForecast(userId: string, asOf: PlainDate, payload: unknown): Promise<void> {
      const day = formatPlainDate(asOf);
      const sealed = sealValue(payload, `forecasts:${userId}:${day}`);
      await sql`
        insert into forecasts (user_id, as_of, payload) values (${userId}, ${day}, ${sealed})
        on conflict (user_id, as_of) do update set payload = excluded.payload`;
    },

    async getForecast<T = unknown>(userId: string, asOf: PlainDate): Promise<T | undefined> {
      const day = formatPlainDate(asOf);
      const [row] = await sql<{ payload: Buffer }[]>`
        select payload from forecasts where user_id = ${userId} and as_of = ${day}`;
      return row && openValue<T>(row.payload, `forecasts:${userId}:${day}`);
    },

    async saveAgentState(userId: string, state: unknown, expectedVersion: number): Promise<number> {
      const version = expectedVersion + 1;
      const sealed = sealValue(state, `agent_state:${userId}:${version}`);
      const rows =
        expectedVersion === 0
          ? await sql`
              insert into agent_state (user_id, version, state) values (${userId}, ${version}, ${sealed})
              on conflict (user_id) do nothing returning version`
          : await sql`
              update agent_state set version = ${version}, state = ${sealed}, updated_at = now()
              where user_id = ${userId} and version = ${expectedVersion} returning version`;
      if (rows.length === 0) throw new StaleStateError(userId, expectedVersion);
      return version;
    },

    async loadAgentState<T = unknown>(userId: string): Promise<{ version: number; state: T } | undefined> {
      const [row] = await sql<{ version: number; state: Buffer }[]>`
        select version, state from agent_state where user_id = ${userId}`;
      return row && { version: row.version, state: openValue<T>(row.state, `agent_state:${userId}:${row.version}`) };
    },
  };
}
