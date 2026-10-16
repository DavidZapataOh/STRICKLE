import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BOX_KINDS } from "@strickle/core";
import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { migrate, pendingMigrations } from "../../src/migrate.ts";
import { createTestDatabase } from "./helpers.ts";

const migrationsDir = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return pathToFileURL(`${dir}/`);
};

const columns = async (sql: Sql) =>
  (
    await sql`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema = 'public'
      order by table_name, ordinal_position`
  ).map((row) => ({ ...row }));

const all = readdirSync(new URL("../../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort();

describe("migrate", () => {
  it("applies the schema once and is idempotent", async () => {
    const db = await createTestDatabase();
    try {
      expect(await migrate(db.sql)).toEqual(all);
      expect(await migrate(db.sql)).toEqual([]);
    } finally {
      await db.drop();
    }
  });

  it("produces the same schema on two fresh databases", async () => {
    const [a, b] = await Promise.all([createTestDatabase(), createTestDatabase()]);
    try {
      await Promise.all([migrate(a.sql), migrate(b.sql)]);
      expect(await columns(a.sql)).toEqual(await columns(b.sql));
    } finally {
      await Promise.all([a.drop(), b.drop()]);
    }
  });

  it("runs two concurrent migrations without applying anything twice", async () => {
    const db = await createTestDatabase();
    try {
      const results = await Promise.all([migrate(db.sql), migrate(db.sql)]);
      expect(results.flat()).toEqual(all);
    } finally {
      await db.drop();
    }
  });

  it("refuses a migration edited after it was applied", async () => {
    const db = await createTestDatabase();
    try {
      await migrate(db.sql, migrationsDir({ "0001_a.sql": "create table a (id int);" }));
      await expect(migrate(db.sql, migrationsDir({ "0001_a.sql": "create table a (id bigint);" }))).rejects.toThrow(
        /changed after it was applied/,
      );
    } finally {
      await db.drop();
    }
  });

  it("rolls everything back when a later migration fails", async () => {
    const db = await createTestDatabase();
    try {
      const dir = migrationsDir({ "0001_a.sql": "create table a (id int);", "0002_b.sql": "this is not sql;" });
      await expect(migrate(db.sql, dir)).rejects.toThrow();
      const tables = await db.sql`select table_name from information_schema.tables where table_schema = 'public'`;
      expect(tables).toHaveLength(0);
    } finally {
      await db.drop();
    }
  });
});

describe("schema constraints", () => {
  it("accepts every box kind from the domain core and rejects others", async () => {
    const db = await createTestDatabase();
    try {
      await migrate(db.sql);
      const [user] = await db.sql<{ id: string }[]>`insert into users (home_country, locale) values ('CO', 'es') returning id`;
      const userId = user?.id;
      for (const kind of BOX_KINDS) {
        await db.sql`insert into mirror_boxes (user_id, kind, asset, balance) values (${userId ?? ""}, ${kind}, 'USDC', ${Buffer.from("x")})`;
      }
      await expect(
        db.sql`insert into mirror_boxes (user_id, kind, asset, balance) values (${userId ?? ""}, 'bogus', 'USDC', ${Buffer.from("x")})`,
      ).rejects.toThrow();
      await expect(
        db.sql`insert into mirror_boxes (user_id, kind, asset, balance) values (${userId ?? ""}, 'taxes', 'BTC', ${Buffer.from("x")})`,
      ).rejects.toThrow();
    } finally {
      await db.drop();
    }
  });

  it("reports what is pending without applying it", async () => {
    const db = await createTestDatabase();
    try {
      const all = readdirSync(new URL("../../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort();
      expect(await pendingMigrations(db.sql)).toEqual(all);
      await migrate(db.sql);
      expect(await pendingMigrations(db.sql)).toEqual([]);
      expect(await pendingMigrations(db.sql, migrationsDir({ "9999_future.sql": "select 1;" }))).toEqual(["9999_future.sql"]);
    } finally {
      await db.drop();
    }
  });
});
