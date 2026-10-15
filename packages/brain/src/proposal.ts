import type { ActionKind } from "./autonomy.ts";

export type ProposalStatus = "pending" | "approved" | "rejected" | "expired" | "executed";

export interface Proposal {
  id: string;
  /** `digest` binds the approval to the exact action (recipient, amount, parameters) the user saw. */
  action: { kind: ActionKind; amount?: bigint; digest: string };
  createdAt: number;
  expiresAt: number;
  status: ProposalStatus;
  decidedAt?: number;
}

export const PROPOSAL_TTL_SECONDS = 604_800;
/** An approval is good for one execution within this window; after it the user must approve again. */
export const EXECUTE_WINDOW_SECONDS = 86_400;

function epoch(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer of epoch seconds`);
}

export function createProposal(id: string, action: Proposal["action"], now: number, ttlSeconds = PROPOSAL_TTL_SECONDS): Proposal {
  if (id.trim() === "") throw new RangeError("a proposal needs an id");
  if (action.digest.trim() === "") throw new RangeError("a proposal needs the digest of its action");
  epoch(now, "now");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) throw new RangeError("ttlSeconds must be a positive integer");
  return { id, action, createdAt: now, expiresAt: now + ttlSeconds, status: "pending" };
}

export function expireDue(proposal: Proposal, now: number): Proposal {
  epoch(now, "now");
  return proposal.status === "pending" && now >= proposal.expiresAt ? { ...proposal, status: "expired" } : proposal;
}

export function decide(proposal: Proposal, verdict: "approve" | "reject", now: number): { proposal: Proposal } | { error: "already-decided" | "expired" } {
  epoch(now, "now");
  if (proposal.status === "expired" || (proposal.status === "pending" && now >= proposal.expiresAt)) return { error: "expired" };
  if (proposal.status !== "pending") return { error: "already-decided" };
  return { proposal: { ...proposal, status: verdict === "approve" ? "approved" : "rejected", decidedAt: now } };
}

export function execute(proposal: Proposal, digest: string, now: number): { proposal: Proposal } | { error: "not-approved" | "digest-mismatch" | "already-executed" | "approval-expired" } {
  epoch(now, "now");
  if (proposal.status === "executed") return { error: "already-executed" };
  if (proposal.status !== "approved") return { error: "not-approved" };
  if (digest !== proposal.action.digest) return { error: "digest-mismatch" };
  if (now >= (proposal.decidedAt as number) + EXECUTE_WINDOW_SECONDS) return { error: "approval-expired" };
  return { proposal: { ...proposal, status: "executed" } };
}
