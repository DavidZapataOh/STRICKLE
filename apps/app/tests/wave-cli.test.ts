import { describe, expect, it } from "vitest";
import { parseWaitlist, parseWaveArgs } from "../src/server/wave-cli.ts";

describe("parseWaveArgs", () => {
  it("reads every command", () => {
    expect(parseWaveArgs(["status"])).toEqual({ kind: "status" });
    expect(parseWaveArgs(["open"])).toEqual({ kind: "open" });
    expect(parseWaveArgs(["advance"])).toEqual({ kind: "advance" });
    expect(parseWaveArgs(["incident"])).toEqual({ kind: "incident" });
    expect(parseWaveArgs(["resolve"])).toEqual({ kind: "resolve" });
    expect(parseWaveArgs(["invite", "wave 1", "3"])).toEqual({ kind: "invite", label: "wave 1", count: 3 });
    expect(parseWaveArgs(["revoke", "wave 1"])).toEqual({ kind: "revoke", label: "wave 1" });
    expect(parseWaveArgs(["next", "/tmp/waitlist.json"])).toEqual({ kind: "next", file: "/tmp/waitlist.json" });
  });

  it.each([
    ["no command", []],
    ["an unknown command", ["explode"]],
    ["an invite without a count", ["invite", "wave 1"]],
    ["a count that is not a whole number", ["invite", "wave 1", "2.5"]],
    ["a count of zero", ["invite", "wave 1", "0"]],
    ["a count above fifty in one go", ["invite", "wave 1", "51"]],
    ["a label with capitals, because the team seats are found by a lower-case prefix", ["invite", "Team A", "1"]],
    ["a label that is empty", ["invite", "", "1"]],
    ["a label with punctuation that could break a file name", ["invite", "../x", "1"]],
    ["a revoke without a label", ["revoke"]],
    ["extra arguments", ["status", "now"]],
  ])("refuses %s", (_name, argv) => {
    expect(() => parseWaveArgs(argv)).toThrow();
  });
});

describe("parseWaitlist", () => {
  it("reads applicants with their arrival time", () => {
    const [first] = parseWaitlist(JSON.stringify([{ id: "a", arrivedAt: "2026-10-30T08:00:00Z", team: false }]));
    expect(first).toEqual({ id: "a", arrivedAt: new Date("2026-10-30T08:00:00Z"), team: false });
  });

  it.each([
    ["not an array", "{}"],
    ["an entry without an id", JSON.stringify([{ arrivedAt: "2026-10-30T08:00:00Z", team: false }])],
    ["a date that is not a date", JSON.stringify([{ id: "a", arrivedAt: "soon", team: false }])],
    ["a team flag that is not a boolean", JSON.stringify([{ id: "a", arrivedAt: "2026-10-30T08:00:00Z", team: "no" }])],
    ["a null entry", "[null]"],
  ])("refuses %s", (_name, text) => {
    expect(() => parseWaitlist(text)).toThrow();
  });
});
