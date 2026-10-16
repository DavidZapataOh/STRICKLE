// workflows/agent/enclave/proposals.ts
import { type Proposal as BrainProposal } from "@strickle/brain";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "viem";
import type { Profile } from "./profile.ts";

export type StoredProposal = Profile["proposals"][number];

export const stableJson = (value: Record<string, string>): string =>
  JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1))));

export const proposalDigest = (input: { payee: string; amount: string; month: string }): `0x${string}` =>
  bytesToHex(sha256(new TextEncoder().encode(stableJson({ kind: "salary-day-one", ...input }))));

export const toBrain = (proposal: StoredProposal): BrainProposal => ({
  id: proposal.id,
  action: { kind: "salary-day-one", amount: BigInt(proposal.amount), digest: proposal.digest },
  createdAt: proposal.createdAt,
  expiresAt: proposal.expiresAt,
  status: proposal.status,
  ...(proposal.decidedAt > 0 ? { decidedAt: proposal.decidedAt } : {}),
});

export const fromBrain = (proposal: BrainProposal, stored: StoredProposal): StoredProposal => ({
  ...stored,
  status: proposal.status,
  decidedAt: proposal.decidedAt ?? stored.decidedAt,
});
