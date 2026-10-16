import { describe, expect, it } from "vitest";
import { connect, pingDatabase } from "../../src/connect.ts";

describe("connect against the local database", () => {
  it("opens a working connection without TLS and ends cleanly", async () => {
    const sql = connect(process.env.DATABASE_URL ?? "", { max: 1 });
    try {
      const [row] = await sql<{ one: number }[]>`select 1 as one`;
      expect(row?.one).toBe(1);
    } finally {
      await sql.end();
    }
  });

  it("pings and reports the time it took", async () => {
    const sql = connect(process.env.DATABASE_URL ?? "", { max: 1 });
    try {
      const { ms } = await pingDatabase(sql);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThan(5000);
    } finally {
      await sql.end();
    }
  });
});
