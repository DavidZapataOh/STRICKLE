import { describe, expect, it } from "vitest";
import { relayResultOf } from "../src/server/relay-types.ts";

describe("relayResultOf", () => {
  it("keeps what the relay itself answered", () => {
    expect(relayResultOf({ status: "busy", retryAfterSeconds: 30 })).toEqual({ status: "busy", retryAfterSeconds: 30 });
    expect(relayResultOf({ status: "accepted" })).toEqual({ status: "accepted" });
  });

  it("reads the gate's answers, which carry an error and no status", () => {
    expect(relayResultOf({ error: "access-required" })).toEqual({ status: "closed" });
    expect(relayResultOf({ error: "closed" })).toEqual({ status: "closed" });
    expect(relayResultOf({ error: "unavailable" })).toEqual({ status: "unavailable" });
  });

  it("treats anything it does not understand as unavailable, never as success", () => {
    for (const body of [null, "x", {}, { status: "accepted-ish" }, { error: 5 }]) expect(relayResultOf(body)).toEqual({ status: "unavailable" });
  });
});
