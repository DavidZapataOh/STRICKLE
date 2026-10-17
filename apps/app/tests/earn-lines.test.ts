import type { Notice } from "@strickle/agent/notice-schema";
import { describe, expect, it } from "vitest";
import { earnLines } from "../src/activity/earn.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import ptBr from "../src/i18n/dictionaries/pt-br.json";

const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const put: Notice = { kind: "earn", box: "profit", deposit: true, name: "EarnKit USDC Vault", protocol: "Morpho", vault: EARN, amount: "500000000", counter: "498000000000000000000", apyBps: 420 };
const back: Notice = { ...put, deposit: false, apyBps: 0 };
const held: Notice = { kind: "earn-held", box: "profit", deposit: true, name: "EarnKit USDC Vault", reason: "quote-unavailable" };
const other: Notice = { kind: "salary", month: "2026-11", paid: "1000000", pending: "0" };
const at = (notice: Notice, timestamp = 1_792_000_000) => ({ notice, timestamp });

describe("earnLines", () => {
  it("writes a deposit with the brain's fixed sentence, naming the vault, the protocol and the rate", () => {
    const [line] = earnLines([at(put)], "en", en.boxes);
    expect(line).toMatchObject({ kind: "earn", text: "Your Profit box put 500.00 USDC to work in EarnKit USDC Vault (Morpho, 4.2% a year when it started). The rate changes and the value can go down; you can take it back at any time." });
  });

  it("writes a withdrawal and a hold in the language of the screen", () => {
    expect(earnLines([at(back)], "en", en.boxes)[0]).toMatchObject({ kind: "earn-back", text: "Your Profit box took 500.00 USDC back from EarnKit USDC Vault (Morpho)." });
    expect(earnLines([at(held)], "es", es.boxes)[0]?.text).toContain("está en pausa: el servicio de Circle no respondió");
    expect(earnLines([at(put)], "pt-br", ptBr.boxes)[0]?.text).toContain("ao ano");
  });

  it("keeps only the yield notices, in order, with ids that do not repeat", () => {
    const lines = earnLines([at(put, 10), at(other, 20), at(back, 30), at(held, 40)], "en", en.boxes);
    expect(lines.map((line) => line.kind)).toEqual(["earn", "earn-back", "earn-held"]);
    expect(new Set(lines.map((line) => line.id)).size).toBe(3);
    expect(lines.map((line) => line.timestamp)).toEqual([10, 30, 40]);
  });
});
