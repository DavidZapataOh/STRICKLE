import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProofAttestation } from "../src/components/ProofAttestation.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import ptBr from "../src/i18n/dictionaries/pt-br.json";
import type { AttestationReport } from "../src/server/attestation-report.ts";

const id = `0x${"ab".repeat(32)}` as const;
const NOW = 1_792_000_000;
const contracts = ["AgentExecutor", "AgentState", "AgentHeartbeat"].map((name) => ({ name, workflowId: id }));
const good: AttestationReport = { contracts, status: "consistent", report: { tx: `0x${"cd".repeat(32)}`, at: NOW - 600, workflowId: id, valid: 4, threshold: 4, ok: true, matches: true }, reproduce: "cre workflow hash ./workflows/agent --public_key 0xd5557a1d0806323cad77bc4049ccaca0eadaaf06" };
const view = (report: AttestationReport | null, dictionary = en, lang: "en" | "es" | "pt-br" = "en") => renderToStaticMarkup(<ProofAttestation lang={lang} t={dictionary as typeof en} report={report} now={NOW} explorer="https://explorer.test" />);

describe("ProofAttestation", () => {
  it("passes the checks with what each one found", () => {
    const out = view(good);
    expect(out).toContain("The contracts accept the same workflow");
    expect(out).toContain("signed by 4 of the DON&#x27;s authorized nodes (needed: 4)");
    expect(out).toContain("10 minutes ago");
    expect(out).toContain(`https://explorer.test/tx/0x${"cd".repeat(32)}`);
    expect(out).toContain("cre workflow hash ./workflows/agent --public_key 0xd5557a1d0806323cad77bc4049ccaca0eadaaf06");
  });

  it("names a disagreement, a contract not bound yet and one that could not be read", () => {
    expect(view({ ...good, status: "mismatch" })).toContain("do not accept the same workflow");
    expect(view({ ...good, status: "unbound" })).toContain("not bound to a workflow yet");
    expect(view({ ...good, status: "unreadable" })).toContain("Could not read the workflow");
  });

  it("fails the report plainly: too few signatures, another workflow, no report, could not check", () => {
    expect(view({ ...good, report: { ...(good.report as { tx: `0x${string}`; at: number; workflowId: `0x${string}` }), valid: 2, threshold: 4, ok: false, matches: true } })).toContain("Only 2 valid signatures of the 4 needed");
    expect(view({ ...good, report: { ...(good.report as { tx: `0x${string}`; at: number; workflowId: `0x${string}` }), valid: 4, threshold: 4, ok: false, matches: false } })).toContain("carries a different workflow");
    expect(view({ ...good, report: { error: "none" } })).toContain("No report has been delivered yet");
    expect(view({ ...good, report: { error: "unreadable" } })).toContain("Could not be checked right now");
    expect(view(null)).toContain("could not be read right now");
  });

  it("says what the DON verifies and what this page verifies, and never claims the hardware's quote", () => {
    const out = view(good);
    expect(out).toContain("verifies the enclave&#x27;s attestation before it signs");
    expect(out).toContain("does not show the hardware quote");
    expect(out).not.toMatch(/attested by the hardware|hardware[- ]attested|proves? the hardware/i);
  });

  it("speaks Spanish and Portuguese", () => {
    expect(view(good, es as unknown as typeof en, "es")).toContain("Los contratos aceptan el mismo workflow");
    expect(view(good, ptBr as unknown as typeof en, "pt-br")).toContain("Os contratos aceitam o mesmo workflow");
  });
});
