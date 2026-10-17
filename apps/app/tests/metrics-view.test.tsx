import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetricsView } from "../src/components/MetricsView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import ptBr from "../src/i18n/dictionaries/pt-br.json";
import type { Metrics } from "../src/server/metrics.ts";

const amounts = (total: bigint, team: bigint) => ({ total: total.toString(), team: team.toString(), organic: (total - team).toString() });
const payload: Metrics = {
  network: "testnet",
  asOfBlock: "67720256",
  vaults: { total: 5, team: 2, organic: 3 },
  usdcHeld: amounts(140_000_000n, 100_000_000n),
  usdcAllocated: amounts(370_000_000n, 300_000_000n),
  agentMoved: {
    total: amounts(1_025_000_000n, 800_000_000n),
    byKind: { split: amounts(370_000_000n, 300_000_000n), salary: amounts(500_000_000n, 400_000_000n), swap: amounts(99_000_000n, 99_000_000n), earn: amounts(56_000_000n, 1_000_000n) },
  },
  notMeasured: ["yield"],
};
const view = (dictionary = en, lang: "en" | "es" | "pt-br" = "en", metrics: Metrics = payload) => renderToStaticMarkup(<MetricsView lang={lang} t={dictionary as typeof en} payload={metrics} />);

describe("MetricsView", () => {
  it("shows what the agent moved by kind and in total, the team apart from everyone else", () => {
    const out = view();
    for (const title of ["What the agent moved", "Income split into boxes", "Salary paid", "Currency conversions", "Money put to work and taken back", "Everything the agent moved"]) expect(out).toContain(title);
    expect(out).toContain("US$800.00");
    expect(out).toContain("US$225.00");
    expect(out.match(/From the team/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps both the team and the organic row when one of them is zero, and says how the team is told apart and that testnet USDC is test USDC", () => {
    const out = view(en, "en", { ...payload, agentMoved: { ...payload.agentMoved, byKind: { ...payload.agentMoved.byKind, swap: amounts(0n, 0n) } } });
    expect(out).toContain("From everyone else");
    expect(out).toContain("The team is the addresses we list plus anyone they funded directly");
    expect(out).toContain("test USDC");
    expect(out).toContain("Private payments are not counted");
  });

  it("still renders for a snapshot recorded before the agent's moves were counted", () => {
    const old = { ...payload, agentMoved: undefined } as unknown as Metrics;
    const out = view(en, "en", old);
    expect(out).toContain("USDC held");
    expect(out).not.toContain("What the agent moved");
  });

  it("speaks Spanish and Portuguese, with the amounts in the language's style", () => {
    expect(view(es as unknown as typeof en, "es")).toContain("Lo que movió el agente");
    expect(view(ptBr as unknown as typeof en, "pt-br")).toContain("O que o agente movimentou");
  });

  it("never claims more than it measures", () => {
    expect(view()).not.toMatch(/guarantee|insured|audited|growth|users? (love|trust)/i);
  });
});
