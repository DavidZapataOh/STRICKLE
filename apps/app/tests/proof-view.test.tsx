import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GUARANTEES } from "../src/config/guarantees.ts";
import { ProofView } from "../src/components/ProofView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import ptBr from "../src/i18n/dictionaries/pt-br.json";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const contracts = [
  { name: "BoxVault", address: a(1), deployed: true, verified: true },
  { name: "BoxVaultFactory", address: a(2), deployed: true, verified: false },
  { name: "AgentExecutor", address: a(3), deployed: true, verified: null },
  { name: "PolicyPool", address: a(4), deployed: false, verified: null },
];
const html = (text: string | undefined) => (text ?? "").replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
const NOW = 1_792_000_000;
const props = { contracts, activity: { lastWriteAt: NOW - 600, lastTx: `0x${"ab".repeat(32)}` as `0x${string}` }, now: NOW, explorer: "https://explorer.test", repo: "https://github.com/example/strickle" };
const view = (over: Record<string, unknown> = {}, dictionary = en, lang: "en" | "es" | "pt-br" = "en") => renderToStaticMarkup(<ProofView lang={lang} t={dictionary as typeof en} {...props} {...over} />);

describe("ProofView", () => {
  it("lists every contract with a link to the explorer and its three possible states", () => {
    const out = view();
    for (const name of ["BoxVault", "BoxVaultFactory", "AgentExecutor", "PolicyPool"]) expect(out).toContain(name);
    expect(out).toContain(`https://explorer.test/address/${a(1)}`);
    expect(out).toContain("Source verified");
    expect(out).toContain("Source not verified");
    expect(out).toContain("Could not check");
    expect(out).toContain("Not deployed here");
  });

  it("states each guarantee with its function and links to the code and the test on GitHub", () => {
    const out = view();
    for (const entry of GUARANTEES) {
      expect(out).toContain(html(entry.text.en));
      expect(out).toContain(`${entry.function}(`);
      expect(out).toContain(`https://github.com/example/strickle/blob/main/${entry.source}`);
      expect(out).toContain(`https://github.com/example/strickle/blob/main/${entry.test}`);
    }
  });

  it("says when the agent last wrote, with the transaction, and says so plainly when it never has or cannot be read", () => {
    expect(view()).toContain("10 minutes ago");
    expect(view()).toContain(`https://explorer.test/tx/0x${"ab".repeat(32)}`);
    expect(view({ activity: { lastWriteAt: null, lastTx: null } })).toContain("No activity yet");
    expect(view({ activity: null })).toContain("could not be read right now");
  });

  it("keeps rendering the other parts when the contracts could not be read", () => {
    const out = view({ contracts: null });
    expect(out).toContain("could not be read right now");
    expect(out).toContain(html(GUARANTEES[0]?.text.en));
  });

  it("says plainly what it does not prove: unaudited testnet contracts", () => {
    const out = view();
    expect(out).toContain("not audited");
    expect(out).toContain("testnet");
  });

  it("speaks Spanish and Portuguese", () => {
    expect(view({}, es as unknown as typeof en, "es")).toContain("Fuente verificada");
    expect(view({}, ptBr as unknown as typeof en, "pt-br")).toContain("Código-fonte verificado");
    expect(view({}, es as unknown as typeof en, "es")).toContain(html(GUARANTEES[0]?.text.es));
  });

  it("never promises safety, audits, insurance or returns", () => {
    expect(view()).not.toMatch(/guaranteed|insured|risk-free|is safe|are safe/i);
  });
});
