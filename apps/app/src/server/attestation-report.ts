import type { Hex } from "viem";
import { type DeliveredReport, parseHeader, verifyReport } from "./attestation.ts";

const ZERO = `0x${"00".repeat(32)}`;

export interface AttestationReport {
  contracts: { name: string; workflowId: Hex | null }[];
  /** Whether the contracts agree on the workflow they accept: they do, they differ, one is not bound yet, or one could not be read. */
  status: "consistent" | "mismatch" | "unbound" | "unreadable";
  report: { tx: Hex; at: number; workflowId: Hex; valid: number; threshold: number; ok: boolean; matches: boolean } | { error: "none" | "unreadable" };
  /** The command a verifier runs to recompute the workflow ID from the published source. */
  reproduce: string;
}

/**
 * The three checks of the chain of custody. The DON verifies the enclave's attestation before it signs; what can be checked from outside is that the contracts accept
 * one workflow, that the newest report was signed by enough of the DON's authorized nodes, and that it carries that workflow. Each is reported as it is, never as a pass it did not earn.
 */
export async function attestationReport(input: {
  expected: () => Promise<{ name: string; workflowId: Hex | null }[]>;
  latest: () => Promise<DeliveredReport | null>;
  signersOf: (donId: number) => Promise<{ f: number; signers: ReadonlySet<string> }>;
}): Promise<AttestationReport> {
  const contracts = await input.expected();
  const ids = contracts.map((entry) => entry.workflowId);
  const status: AttestationReport["status"] = ids.some((value) => value === null) ? "unreadable" : ids.some((value) => value === ZERO) ? "unbound" : new Set(ids).size === 1 ? "consistent" : "mismatch";
  const accepted = status === "consistent" ? (ids[0] as Hex) : null;

  let report: AttestationReport["report"] = { error: "none" };
  let owner: Hex | null = null;
  const found = await input.latest();
  if (found) {
    try {
      const header = parseHeader(found.raw);
      owner = header.workflowOwner;
      const { f, signers } = await input.signersOf(header.donId);
      const checked = await verifyReport({ raw: found.raw, context: found.context, signatures: found.signatures, signers, f });
      const matches = accepted !== null && header.workflowId.toLowerCase() === accepted.toLowerCase();
      report = { tx: found.tx, at: found.at, workflowId: header.workflowId, valid: checked.valid, threshold: checked.threshold, ok: checked.ok && matches, matches };
    } catch {
      report = { error: "unreadable" };
    }
  }
  return { contracts, status, report, reproduce: `cre workflow hash ./workflows/agent --public_key ${owner ?? "<workflow owner>"}` };
}
