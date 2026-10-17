import type { Notice } from "@strickle/agent/notice-schema";
import { describe, expect, it } from "vitest";
import { earnLines } from "../src/activity/earn.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import ptBr from "../src/i18n/dictionaries/pt-br.json";

const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const put: Notice = { kind: "earn", box: "profit", deposit: true, name: "EarnKit USDC Vault", protocol: "Morpho", vault: EARN, amount: "500000000", counter: "498000000000000000000", apyBps: 420 };
const back: Notice = { ...put, deposit: false, apyBps: 0, gain: "12500000", fee: "1250000" };
const held: Notice = { kind: "earn-held", box: "profit", deposit: true, name: "EarnKit USDC Vault", reason: "quote-unavailable" };
const exited: Notice = { kind: "yield-exit", box: "profit", name: "EarnKit USDC Vault", reason: "price-drop" };
const plan: Notice = { kind: "yield-plan", box: "profit", amount: "10000000000", kept: "1500000000", needed: "1200000000" };
const backNotice: Notice = { kind: "yield-back", box: "payroll", amount: "2525000000", payment: "3000000000", due: "2026-11-04" };
const invite: Notice = { kind: "yield-invite", apyBps: 420 };
const other: Notice = { kind: "salary", month: "2026-11", paid: "1000000", pending: "0" };
const at = (notice: Notice, timestamp = 1_792_000_000) => ({ notice, timestamp });

describe("earnLines", () => {
  it("writes a deposit with the brain's fixed sentence, naming the vault, the protocol and the rate", () => {
    const [line] = earnLines([at(put)], "en", en.boxes);
    expect(line).toMatchObject({ kind: "earn", text: "Your Profit box put 500.00 USDC to work in EarnKit USDC Vault (Morpho, 4.2% a year when it started). The rate changes and the value can go down; you can take it back at any time." });
  });

  it("writes a withdrawal and a hold in the language of the screen", () => {
    expect(earnLines([at(back)], "en", en.boxes)[0]).toMatchObject({ kind: "earn-back", text: "Your Profit box took 500.00 USDC back from EarnKit USDC Vault (Morpho). It earned 12.50 USDC while it was there; the yield fee on that, 1.25 USDC, is shown here and is not charged on testnet." });
    expect(earnLines([at(held)], "es", es.boxes)[0]?.text).toContain("está en pausa: el servicio de Circle no respondió");
    expect(earnLines([at(put)], "pt-br", ptBr.boxes)[0]?.text).toContain("ao ano");
  });

  it("keeps only the yield notices, in order, with ids that do not repeat", () => {
    const lines = earnLines([at(put, 10), at(other, 20), at(back, 30), at(held, 40)], "en", en.boxes);
    expect(lines.map((line) => line.kind)).toEqual(["earn", "earn-back", "earn-held"]);
    expect(new Set(lines.map((line) => line.id)).size).toBe(3);
    expect(lines.map((line) => line.timestamp)).toEqual([10, 30, 40]);
  });

  it("writes a vault that was left, in the three languages, with the reason", () => {
    expect(earnLines([at(exited)], "en", en.boxes)[0]).toMatchObject({ kind: "yield-exit", text: "The agent asked EarnKit USDC Vault to give back your Profit box's money because its share price fell. It returns to your box as cash when the withdrawal goes through; to put it to work again, ask for it." });
    expect(earnLines([at(exited)], "es", es.boxes)[0]?.text).toContain("el precio de su participación bajó");
    expect(earnLines([at(exited)], "pt-br", ptBr.boxes)[0]?.text).toContain("o preço da sua cota caiu");
  });

  it("explains what the agent kept and put to work, and why it brought money back, with the date", () => {
    expect(earnLines([at(plan)], "en", en.boxes)[0]).toMatchObject({ kind: "yield-plan", text: "Your Profit box keeps 1,500.00 USDC in cash, 1,200.00 USDC of it for what is due soon, and put 10,000.00 USDC to work. The rate changes and the value can go down." });
    expect(earnLines([at(backNotice)], "en", en.boxes)[0]).toMatchObject({ kind: "yield-back", text: "The agent asked the vault for 2,525.00 USDC back for your Payroll box because 3,000.00 USDC is due on Nov 4, 2026, so the money is ready in time." });
    expect(earnLines([at(backNotice)], "es", es.boxes)[0]?.text).toContain("4 nov 2026");
  });

  it("writes the invitation with the rate, in the language of the screen", () => {
    expect(earnLines([at(invite)], "en", en.boxes)[0]).toMatchObject({ kind: "yield-invite", text: "Your money can work while it waits: a vault pays about 4.2% a year at the moment, and the value can also go down. If you want, turn it on in Settings. Only money a box will not need soon is ever used." });
    expect(earnLines([at(invite)], "es", es.boxes)[0]?.text).toContain("cerca de");
  });

  it("reads a withdrawal that carries no gain as zero, never as a broken line", () => {
    const old: Notice = { ...back, gain: undefined, fee: undefined };
    expect(earnLines([at(old)], "en", en.boxes)[0]?.text).toContain("It earned 0.00 USDC");
  });
});
