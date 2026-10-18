import type { Notice } from "@strickle/agent/notice-schema";
import { describe, expect, it } from "vitest";
import { earnAnswered } from "../src/yield/confirm.ts";

const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const;
const put: Notice = { kind: "earn", box: "profit", deposit: true, name: "v", protocol: "Morpho", vault: EARN, amount: "1", counter: "1", apyBps: 420 };
const held: Notice = { kind: "earn-held", box: "profit", deposit: true, name: "v", reason: "quote-unavailable" };
const invest = { kind: "invest" as const, box: "profit" as const, vault: EARN, amount: "1" };
const wrap = (...notices: Notice[]) => notices.map((notice) => ({ notice }));

describe("whether the agent has answered a request", () => {
  it("counts a move for that box in that direction, and a hold for that box, as an answer", () => {
    expect(earnAnswered(wrap(put), invest)).toBe(true);
    expect(earnAnswered(wrap(held), invest)).toBe(true);
    expect(earnAnswered(wrap({ ...put, deposit: false }), { ...invest, kind: "divest" })).toBe(true);
  });

  it("does not count another box, the other direction, other notices or silence", () => {
    expect(earnAnswered(wrap({ ...put, box: "taxes" }), invest)).toBe(false);
    expect(earnAnswered(wrap({ ...put, deposit: false }), invest)).toBe(false);
    expect(earnAnswered(wrap({ ...held, deposit: false }), invest)).toBe(false);
    expect(earnAnswered(wrap({ kind: "salary", month: "2026-11", paid: "1", pending: "0" }), invest)).toBe(false);
    expect(earnAnswered([], invest)).toBe(false);
  });
});
