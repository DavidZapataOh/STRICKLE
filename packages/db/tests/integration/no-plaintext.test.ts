import { formatDecimal, money, parsePlainDate } from "@strickle/core";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/migrate.ts";
import { createStore } from "../../src/store.ts";
import { createTestDatabase } from "./helpers.ts";

const SENTINEL = 424_242_424_242n;
const SENTINEL_TEXTS = [SENTINEL.toString(), formatDecimal(money("USDC", SENTINEL))];

let db: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
});

afterAll(() => db.drop());

async function dumpEveryRow(sql: Sql): Promise<string> {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  const dumps = await Promise.all(
    tables.map(({ table_name }) => sql.unsafe(`select row_to_json(t)::text as row from "${table_name}" t`)),
  );
  return dumps
    .flat()
    .map((r) => r.row)
    .join("\n");
}

describe("a dump of the database", () => {
  it("contains no amount stored through the store", async () => {
    const store = createStore(db.sql, db.key);
    const user = await store.createUser({ homeCountry: "AR", locale: "es" });
    await store.setMirrorBalance(user, "taxes", money("USDC", SENTINEL));
    await store.addReceipt(user, "split", { total: SENTINEL, text: formatDecimal(money("USDC", SENTINEL)) });
    await store.putForecast(user, parsePlainDate("2026-10-15"), { floor: SENTINEL });
    await store.saveAgentState(user, { cushion: SENTINEL }, 0);

    const dump = await dumpEveryRow(db.sql);
    for (const text of SENTINEL_TEXTS) expect(dump).not.toContain(text);
    expect(dump).toContain(user);
  });

  it("would reveal an amount stored in plaintext (the detector works)", async () => {
    await db.sql`create table leaky (amount text)`;
    await db.sql`insert into leaky (amount) values (${SENTINEL.toString()})`;
    expect(await dumpEveryRow(db.sql)).toContain(SENTINEL.toString());
    await db.sql`drop table leaky`;
  });

  it("has exactly the reviewed columns, so a new column cannot slip in unnoticed", async () => {
    // Adding a column means adding it here on purpose: sealed values must be bytea,
    // and nothing that can hold an amount may be text, numeric or json.
    // metric_snapshots holds public, chain-derived aggregates (what /api/metrics serves) and the collector's resume state: vault and owner addresses that
    // are already public through the factory's events and two running totals, never an amount per user. It is the one deliberate exception to "no json".
    // deposit_intents holds only facts already public on the source chain and on Arc (vault, sender, amount, transaction hashes) and the depositor's own income/own/unsure declaration.
    // The access tables hold only the hash of an invitation code, its label and times, and a random session id.
    // The rate tables hold a keyed hash of an address or a public vault address, a count and a time: no amount, no user data.
    const reviewed = [
      "access_sessions.created_at:timestamp with time zone",
      "access_sessions.expires_at:timestamp with time zone",
      "access_sessions.invite_id:bigint",
      "access_sessions.revoked_at:timestamp with time zone",
      "access_sessions.sid:text",
      "agent_state.state:bytea",
      "agent_state.updated_at:timestamp with time zone",
      "agent_state.user_id:uuid",
      "agent_state.version:integer",
      "deposit_intents.amount:bigint",
      "deposit_intents.burn_tx:text",
      "deposit_intents.created_at:timestamp with time zone",
      "deposit_intents.failure:text",
      "deposit_intents.fee_mode:text",
      "deposit_intents.forward_tx:text",
      "deposit_intents.id:uuid",
      "deposit_intents.intent:text",
      "deposit_intents.received:bigint",
      "deposit_intents.source_address:text",
      "deposit_intents.source_chain:text",
      "deposit_intents.speed:text",
      "deposit_intents.status:text",
      "deposit_intents.updated_at:timestamp with time zone",
      "deposit_intents.vault:text",
      "forecasts.as_of:date",
      "forecasts.id:uuid",
      "forecasts.payload:bytea",
      "forecasts.user_id:uuid",
      "invites.code_hash:text",
      "invites.created_at:timestamp with time zone",
      "invites.id:bigint",
      "invites.label:text",
      "invites.redeemed_at:timestamp with time zone",
      "metric_snapshots.as_of_block:bigint",
      "metric_snapshots.id:bigint",
      "metric_snapshots.network:text",
      "metric_snapshots.payload:jsonb",
      "metric_snapshots.state:jsonb",
      "metric_snapshots.taken_at:timestamp with time zone",
      "mirror_boxes.asset:text",
      "mirror_boxes.balance:bytea",
      "mirror_boxes.id:uuid",
      "mirror_boxes.kind:text",
      "mirror_boxes.updated_at:timestamp with time zone",
      "mirror_boxes.user_id:uuid",
      "rate_counters.hits:integer",
      "rate_counters.key:text",
      "rate_counters.window_start:timestamp with time zone",
      "rate_slots.claimed_at:timestamp with time zone",
      "rate_slots.key:text",
      "receipts.created_at:timestamp with time zone",
      "receipts.id:uuid",
      "receipts.kind:text",
      "receipts.payload:bytea",
      "receipts.user_id:uuid",
      "schema_migrations.applied_at:timestamp with time zone",
      "schema_migrations.checksum:text",
      "schema_migrations.name:text",
      "users.created_at:timestamp with time zone",
      "users.home_country:character",
      "users.id:uuid",
      "users.locale:text",
      "wave_events.at:timestamp with time zone",
      "wave_events.id:bigint",
      "wave_events.kind:text",
      "wave_events.tranche:integer",
    ];
    const columns = await db.sql<{ column: string }[]>`
      select table_name || '.' || column_name || ':' || data_type as column
      from information_schema.columns where table_schema = 'public'
      order by 1`;
    expect(columns.map((c) => c.column)).toEqual(reviewed);
  });
});
