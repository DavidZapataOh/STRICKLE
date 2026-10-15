import { randomBytes, randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

function adminUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (run `npm run db:up`)");
  return url;
}

export async function createTestDatabase(): Promise<{ sql: Sql; key: Buffer; drop: () => Promise<void> }> {
  const admin = postgres(adminUrl(), { max: 1 });
  const name = `strickle_test_${randomUUID().replaceAll("-", "")}`;
  await admin.unsafe(`create database ${name}`);
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  const sql = postgres(url.toString(), { max: 4 });
  return {
    sql,
    key: randomBytes(32),
    async drop() {
      await sql.end();
      await admin.unsafe(`drop database ${name} with (force)`);
      await admin.end();
    },
  };
}
