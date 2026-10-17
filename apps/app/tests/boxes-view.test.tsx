import { BOX_KINDS } from "@strickle/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../src/chain/snapshot.ts";
import { BoxesView, fillRatio } from "../src/components/BoxesView.tsx";
import type { ScreenState } from "../src/components/HomeView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { planNotice, snapshotOf, vaultState } from "./fixtures-plan.ts";

const lockedTaxes = (state: Snapshot["vault"]): Snapshot["vault"] => ({
  ...state,
  boxes: state.boxes.map((box) => (box.kind === "taxes" ? { ...box, rule: { delaySeconds: 172_800, alwaysDelayed: true, restricted: false, floor: 0n, lockedUntil: 1_900_000_000 } } : box)),
});
const payments: Snapshot["payments"] = [
  { txHash: `0x${"11".repeat(32)}`, at: 1_799_000_000, asset: "USDC", total: 1_000_000_000n, byBox: { taxes: 200_000_000n, operating: 600_000_000n, profit: 200_000_000n }, byAgent: true },
  { txHash: `0x${"22".repeat(32)}`, at: 1_798_000_000, asset: "EURC", total: 50_000_000n, byBox: { operating: 50_000_000n }, byAgent: false },
];
const targets = { taxes: "500000000", payroll: "0", salary: "1800000000", operating: "840000000", emergency: "2000000000" };
const snapshot = (patch: Partial<Snapshot> = {}): Snapshot =>
  snapshotOf({ vault: lockedTaxes(vaultState({ taxes: 270_000_000n, salary: 900_000_000n, operating: 600_000_000n, profit: 100_000_000n })), payments, plan: planNotice({ targets }), ...patch });
const view = (s: Snapshot | ScreenState, t: typeof en = en, lang: "en" | "pt-br" = "en") =>
  renderToStaticMarkup(<BoxesView lang={lang} t={t} state={"status" in s ? s : { status: "ready", snapshot: s }} />);

describe("fillRatio", () => {
  it("is null without a target and clamps between zero and one", () => {
    expect(fillRatio(5n, 0n)).toBeNull();
    expect(fillRatio(5n, 10n)).toBe(0.5);
    expect(fillRatio(50n, 10n)).toBe(1);
    expect(fillRatio(0n, 10n)).toBe(0);
  });
});

describe("BoxesView", () => {
  it("lists the six boxes with their balance, their rule and the total", () => {
    const out = view(snapshot());
    for (const name of ["Taxes", "Payroll", "Your salary", "Operating cash", "Emergency fund", "Profit"]) expect(out).toContain(name);
    expect(out).toContain("US$270.00");
    expect(out).toContain("Locked until Mar 17");
    expect(out).toContain("Held in your boxes");
    expect(out).toContain("US$1,870.00");
    expect(out).toContain("42 days of cushion");
  });

  it("counts what is working in a vault as the user's, and holds euros apart", () => {
    const base = snapshot();
    const vault = { ...base.vault, boxes: base.vault.boxes.map((box) => (box.kind === "emergency" ? { ...box, invested: 400_000_000n, eurc: 7_000_000n } : box)) };
    const out = view({ ...base, vault });
    expect(out).toContain("US$2,270.00");
    expect(out).toContain("Includes US$400.00 working in a vault");
    expect(out).toContain("And €7.00 in euro digital dollars");
    expect(out).toContain("Also holds €7.00");
  });

  it("shows progress to the target when there is one and says so when there is none", () => {
    const out = view(snapshot());
    expect(out).toContain("US$900.00 of US$1,800.00");
    expect(out).toContain("No target: whatever is left lands here");
  });

  it("lists recent payments with their split bar, in the payment's own currency, and who made the split", () => {
    const out = view(snapshot());
    expect(out).toContain("Recent payments");
    expect(out).toContain("Split by your agent");
    expect(out).toContain("Moved by you");
    expect(out).toContain('class="split-bar"');
    expect(out).toContain("€50.00");
  });

  it("works without a plan: balances and rules only, no cushion line, no targets", () => {
    const out = view(snapshot({ plan: null, key: "missing" }));
    expect(out).toContain("US$270.00");
    expect(out).not.toContain("days of cushion");
    expect(out).not.toContain(" of US$");
  });

  it("has an empty state for no payments, an unavailable note when activity is down, and a note when older ones are cut", () => {
    expect(view(snapshot({ payments: [] }))).toContain("No payments yet");
    expect(view(snapshot({ payments: [], activity: "unavailable" }))).toContain("Your activity is unavailable right now");
    expect(view(snapshot({ olderPayments: true }))).toContain("Older payments are not shown.");
  });

  it("covers signed out, loading and error", () => {
    expect(view({ status: "signedOut" })).toContain('href="/en/start"');
    expect(view({ status: "loading" })).toContain("Loading your plan");
    expect(view({ status: "error" })).toContain("Try again");
  });

  it("survives a vault that holds nothing and a target of zero", () => {
    const empty = snapshot({ vault: vaultState(), payments: [], plan: planNotice({ targets: { taxes: "0", payroll: "0", salary: "0", operating: "0", emergency: "0" } }) });
    expect(view(empty)).not.toMatch(/NaN|undefined|Infinity/);
    expect(BOX_KINDS).toHaveLength(6);
  });

  it("renders in Portuguese with its own format and rule text", () => {
    const out = view(snapshot(), pt, "pt-br");
    expect(out).toContain("Pagamentos recentes");
    expect(out).toContain("Bloqueada até");
    expect(out).toContain("US$ 270,00");
  });
});

describe("BoxesView with euros", () => {
  const withEuros = (): Snapshot => {
    const base = vaultState({ taxes: 270_000_000n, payroll: 100_000_000n, operating: 600_000_000n });
    const vault = { ...base, boxes: base.boxes.map((box) => (box.kind === "payroll" ? { ...box, usdc: 0n, eurc: 800_000_000n } : box)) };
    return snapshotOf({
      vault,
      plan: planNotice({
        rates: { taxBps: 1800, fx: { usdcUsd: "100000000", eurcUsd: "112000000", at: 1_800_000_000 } },
        settings: { ...planNotice().settings, currencies: { payroll: "EUR", operating: "USD", emergency: "USD", profit: "USD" } },
      }),
    });
  };

  it("shows euros as euros and the total in dollars at the latest rate", () => {
    const out = view(withEuros());
    expect(out).toContain("Also holds €800.00 in euro digital dollars");
    expect(out).toContain("Total in dollars at the latest rate");
    // 270 + 600 dollars plus 800 euros at 1.12
    expect(out).toContain("US$1,766.00");
  });

  it("marks a box that is declared in euros", () => {
    const out = view(withEuros());
    expect(out).toContain("Declared in euros: dollars that arrive here are converted.");
    expect(out.match(/Declared in euros/g)).toHaveLength(1);
  });

  it("shows no dollar equivalent without a rate, and no mark without a declaration", () => {
    const out = view(snapshotOf({ vault: vaultState({ taxes: 1_000_000n }), plan: planNotice() }));
    expect(out).not.toContain("Total in dollars at the latest rate");
    expect(out).not.toContain("Declared in euros");
  });
});
