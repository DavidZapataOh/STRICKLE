import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import type { Sql } from "postgres";

export const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

const LOCK_ID = 7_740_017;

export async function migrate(sql: Sql, dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_ID})`;
    await tx`
      create table if not exists schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )`;

    const applied: string[] = [];
    for (const file of files) {
      const text = readFileSync(new URL(file, dir), "utf8");
      const checksum = createHash("sha256").update(text).digest("hex");
      const [row] = await tx<{ checksum: string }[]>`select checksum from schema_migrations where name = ${file}`;
      if (row) {
        if (row.checksum !== checksum) throw new Error(`migration ${file} changed after it was applied`);
        continue;
      }
      await tx.unsafe(text).simple();
      await tx`insert into schema_migrations (name, checksum) values (${file}, ${checksum})`;
      applied.push(file);
    }
    return applied;
  });
}
