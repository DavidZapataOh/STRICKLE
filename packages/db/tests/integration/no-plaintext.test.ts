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
    const reviewed = [
      "agent_state.state:bytea",
      "agent_state.updated_at:timestamp with time zone",
      "agent_state.user_id:uuid",
      "agent_state.version:integer",
      "forecasts.as_of:date",
      "forecasts.id:uuid",
      "forecasts.payload:bytea",
      "forecasts.user_id:uuid",
      "mirror_boxes.asset:text",
      "mirror_boxes.balance:bytea",
      "mirror_boxes.id:uuid",
      "mirror_boxes.kind:text",
      "mirror_boxes.updated_at:timestamp with time zone",
      "mirror_boxes.user_id:uuid",
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
    ];
    const columns = await db.sql<{ column: string }[]>`
      select table_name || '.' || column_name || ':' || data_type as column
      from information_schema.columns where table_schema = 'public'
      order by 1`;
    expect(columns.map((c) => c.column)).toEqual(reviewed);
  });
});
