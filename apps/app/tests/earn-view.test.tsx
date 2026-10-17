import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EarnControl, type EarnRow } from "../src/components/EarnControl.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import ptBr from "../src/i18n/dictionaries/pt-br.json";
import { settingsText } from "../src/i18n/slices.ts";
import type { EarnStatus } from "../src/yield/status.ts";

const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const;
const quote = { address: EARN, name: "EarnKit USDC Vault", protocol: "Morpho", apyBps: 420, asOf: "2026-10-17T20:10:04Z" };
const rows: EarnRow[] = [
  { box: "profit", position: 3_003_174n, available: 4_000_000_000n, room: 4_000_000_000n, maxInvestBps: 10_000 },
  { box: "taxes", position: 0n, available: 2_000_000_000n, room: 1_000_000_000n, maxInvestBps: 5_000 },
  { box: "operating", position: 0n, available: 5_000_000_000n, room: 0n, maxInvestBps: 0 },
];
const view = (status: EarnStatus, over: { dictionary?: typeof en; lang?: "en" | "es" | "pt-br"; quote?: typeof quote | undefined; rows?: EarnRow[]; automatic?: boolean; totals?: { gain: bigint; fee: bigint } } = {}) =>
  renderToStaticMarkup(
    <EarnControl lang={over.lang ?? "en"} t={settingsText((over.dictionary ?? en) as typeof en)} status={status} rows={over.rows ?? rows} quote={"quote" in over ? over.quote : quote} automatic={over.automatic} totals={over.totals} onSwitch={async () => undefined} onMove={async () => undefined} />,
  );

describe("EarnControl", () => {
  it("shows the live rate, the vault, and for each box that can earn where it stands and the two moves", () => {
    const out = view({ kind: "active" });
    expect(out).toContain("Rate now: 4.2% a year, as published by the vault.");
    expect(out).toContain("EarnKit USDC Vault");
    expect(out).toContain("Morpho");
    for (const box of ["Profit", "Taxes"]) expect(out).toContain(box);
    expect(out).toContain("In the vault: US$3.00");
    expect(out).toContain("Nothing in the vault yet.");
    expect(out.match(/Put to work/g)?.length).toBeGreaterThanOrEqual(2);
    // taking back is offered only where something is in the vault
    expect(out.match(/Take back/g)?.length).toBe(1);
  });

  it("says what share of a box may earn, and that a box with none set does not", () => {
    const out = view({ kind: "active" });
    expect(out).toContain("Up to 100% of this box can be put to work.");
    expect(out).toContain("Up to 50% of this box can be put to work.");
    expect(out).toContain("This box is not set to put money to work.");
    expect(out).not.toContain("Operating cash: put");
  });

  it("is honest when the rate cannot be read", () => {
    expect(view({ kind: "active" }, { quote: undefined })).toContain("The rate is not available right now.");
  });

  it.each([
    [{ kind: "active" }, "Ready."],
    [{ kind: "pending", from: 1_800_000_000 }, "Ready on"],
    [{ kind: "unavailable" }, "created before this existed"],
    [{ kind: "not-allowed", needs: ["vault"] }, "Not allowed on this account yet."],
    [{ kind: "unreadable" }, "could not be read right now"],
  ] as [EarnStatus, string][])("says each state of the chain: %#", (status, text) => {
    expect(view(status)).toContain(text);
  });

  it("offers the signature to allow it only where it is not allowed, and keeps the moves closed where they cannot work", () => {
    expect(view({ kind: "not-allowed", needs: ["adapter", "vault"] })).toContain("Allow putting money to work");
    expect(view({ kind: "active" })).not.toContain("Allow putting money to work");
    const closed = view({ kind: "pending", from: 1 });
    expect(closed).toMatch(/<button[^>]*disabled=""[^>]*>Change<\/button>/);
  });

  it("speaks Spanish and Portuguese, with the date and the rate following the language", () => {
    expect(view({ kind: "pending", from: 1_800_000_000 }, { dictionary: es as unknown as typeof en, lang: "es" })).toContain("Listo el");
    expect(view({ kind: "active" }, { dictionary: es as unknown as typeof en, lang: "es" })).toMatch(/Tasa ahora: 4[.,]2\s?%/);
    expect(view({ kind: "active" }, { dictionary: ptBr as unknown as typeof en, lang: "pt-br" })).toMatch(/Taxa agora: 4[.,]2\s?%/);
  });

  it("never promises a rate, a saving, a speed or safety", () => {
    for (const status of [{ kind: "active" }, { kind: "pending", from: 1 }, { kind: "not-allowed", needs: ["vault"] }, { kind: "unavailable" }] as EarnStatus[]) {
      expect(view(status)).not.toMatch(/guarantee|insured|no risk|you will (save|earn)|best rate|faster/i);
    }
    expect(view({ kind: "active" })).toContain("the value can go down");
  });

  it("offers the switch for putting idle money to work, with an honest sentence, and marks the one in force", () => {
    const off = view({ kind: "active" }, { automatic: false });
    expect(off).toContain("Let the agent put idle money to work");
    expect(off).toContain("only puts to work what a box does not need within sixty days");
    expect(off).toContain("the value can go down");
    expect(off).toMatch(/name="earn-auto" checked="" value="off"/);
    expect(view({ kind: "active" }, { automatic: true })).toMatch(/name="earn-auto" checked="" value="on"/);
  });

  it("keeps the switch open where the vault cannot earn and hides it where the plan has not said", () => {
    // the switch is the owner's own setting, kept by the agent, so it works even where the vault cannot put money to work
    expect(view({ kind: "unavailable" }, { automatic: false })).not.toContain('<fieldset class="choices" disabled=""');
    expect(view({ kind: "active" }, { automatic: undefined })).not.toContain("Let the agent put idle money to work");
  });

  it("says what the withdrawals have earned and the fee on it, honestly about it not being charged on testnet", () => {
    const out = view({ kind: "active" }, { totals: { gain: 12_500_000n, fee: 1_250_000n } });
    expect(out).toContain("Earned so far: US$12.50.");
    expect(out).toContain("Fee on that, shown and not charged on testnet: US$1.25.");
    expect(view({ kind: "active" }, { totals: { gain: 0n, fee: 0n } })).toContain("Nothing earned yet.");
    expect(view({ kind: "active" })).not.toContain("Earned so far");
  });
});
