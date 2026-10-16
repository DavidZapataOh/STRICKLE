import { describe, expect, it } from "vitest";
import { confirmTarget, describeDatabase } from "../src/connect.ts";

describe("describeDatabase", () => {
  it("recognises the local development database", () => {
    expect(describeDatabase("postgres://strickle:strickle@localhost:54329/strickle")).toEqual({ host: "localhost", database: "strickle", local: true, pooled: false });
    expect(describeDatabase("postgres://u:p@127.0.0.1:5432/x").local).toBe(true);
  });

  it("treats everything else as remote and spots a pooler", () => {
    const remote = describeDatabase("postgres://u:p@ep-quiet-sun-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require");
    expect(remote).toMatchObject({ local: false, pooled: true, database: "neondb" });
    expect(describeDatabase("postgres://u:p@db.example.com/x?pgbouncer=true").pooled).toBe(true);
    expect(describeDatabase("postgres://u:p@db.example.com/x").pooled).toBe(false);
  });

  it("refuses a URL that is not Postgres", () => {
    expect(() => describeDatabase("mysql://u:p@db/x")).toThrow(/postgres/);
    expect(() => describeDatabase("not a url")).toThrow();
  });
});

describe("confirmTarget", () => {
  it("lets a local database through and demands the host for a remote one", () => {
    expect(() => confirmTarget("postgres://u:p@localhost/x", undefined)).not.toThrow();
    expect(() => confirmTarget("postgres://u:p@db.example.com/x", undefined)).toThrow(/--confirm-host=db\.example\.com/);
    expect(() => confirmTarget("postgres://u:p@db.example.com/x", "other.example.com")).toThrow(/--confirm-host=db\.example\.com/);
    expect(() => confirmTarget("postgres://u:p@db.example.com/x", "db.example.com")).not.toThrow();
  });
});
