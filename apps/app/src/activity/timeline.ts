import { openNotice } from "@strickle/agent/notices";
import { type Notice, noticeSchema } from "@strickle/agent/notice-schema";
import { proposalDigest } from "@strickle/agent/proposals";
import { buildReceipt, type Facts, type FactValue, type Lang, type NumberStyle } from "@strickle/brain";
import { BOX_KINDS, type BoxKind } from "@strickle/core";
import type { Locale } from "@strickle/design/locale";
import { type Address, type Hex, getAddress, hexToBytes } from "viem";
import type { NoticeKey } from "../keys/notice-key.ts";
import { shortAddress } from "./format.ts";
import type { ChainReceipt, SealedNotice } from "./types.ts";

export interface OpenedNotice {
  id: bigint;
  timestamp: number;
  txHash: Hex;
  notice: Notice | null;
}

export function openNotices(sealed: SealedNotice[], vault: Address, key: NoticeKey | null): OpenedNotice[] {
  return sealed.map((item) => {
    let notice: Notice | null = null;
    if (key) {
      try {
        const opened = openNotice(key.secret, key.publicKey, vault, item.id, hexToBytes(item.sealed));
        const parsed = opened === undefined ? undefined : noticeSchema.safeParse(opened);
        notice = parsed?.success ? parsed.data : null;
      } catch {
        notice = null;
      }
    }
    return { id: item.id, timestamp: item.timestamp, txHash: item.txHash, notice };
  });
}

export type ProposalState = "pending" | "expired" | "rejected" | "executed" | "approved";

export interface TimelineProposal {
  type: "proposal";
  proposalId: string;
  amount: bigint;
  payee: Address;
  payeeRaw: string;
  amountRaw: string;
  digest: Hex;
  verified: boolean;
  createdAt: number;
  expiresAt: number;
  state: ProposalState;
  decidedAt: number | null;
}

const SALARY_ID = /^salary-(\d{4}-\d{2})$/;

// The proposal id of a salary day carries its month, so the digest the enclave signed over can be recomputed from the notice's own fields.
function digestMatches(notice: Extract<Notice, { kind: "proposal" }>): boolean {
  const month = SALARY_ID.exec(notice.proposalId)?.[1];
  return month !== undefined && proposalDigest({ payee: notice.payee, amount: notice.amount, month }) === notice.digest;
}

export function foldProposals(notices: OpenedNotice[], now: number): TimelineProposal[] {
  const byId = new Map<string, TimelineProposal>();
  for (const item of [...notices].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const notice = item.notice;
    if (!notice) continue;
    if (notice.kind === "proposal") {
      byId.set(notice.proposalId, {
        type: "proposal",
        proposalId: notice.proposalId,
        amount: BigInt(notice.amount),
        payee: getAddress(notice.payee),
        payeeRaw: notice.payee,
        amountRaw: notice.amount,
        digest: notice.digest as Hex,
        verified: digestMatches(notice),
        createdAt: item.timestamp,
        expiresAt: notice.expiresAt,
        state: "pending",
        decidedAt: null,
      });
    } else if (notice.kind === "decision") {
      const known = byId.get(notice.proposalId);
      if (known) byId.set(notice.proposalId, { ...known, state: notice.status, decidedAt: item.timestamp });
    }
  }
  return [...byId.values()]
    .map((proposal) => (proposal.state === "pending" && now >= proposal.expiresAt ? { ...proposal, state: "expired" as const } : proposal))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// A request waits for the gateway (up to one request per 30 seconds) and the enclave decides at its own clock.
export const APPROVAL_MARGIN_SECONDS = 120;

export const canApprove = (proposal: TimelineProposal, nowSeconds: number): boolean =>
  proposal.state === "pending" && proposal.verified && proposal.expiresAt - nowSeconds > APPROVAL_MARGIN_SECONDS;

export const canReject = (proposal: TimelineProposal, nowSeconds: number): boolean => proposal.state === "pending" && proposal.expiresAt > nowSeconds;

export type UndoReason = "split" | "salary" | "payment";
export const UNDO_REASON: Record<"split" | "salary" | "payment", UndoReason> = { split: "split", salary: "salary", payment: "payment" };

export interface TimelineReceipt {
  type: "receipt";
  id: string;
  at: number;
  kind: "split" | "salary" | "payment";
  ruleId: "cascade" | "salary-day" | "private-spend";
  text: string;
  parts: { box: BoxKind; units: bigint }[];
  total: bigint;
  txHash: Hex;
  undo: { undoable: false; reason: UndoReason };
}

const LANG: Record<Locale, Lang> = { en: "en", es: "es", "pt-br": "pt-br" };
const STYLE: Record<Locale, NumberStyle> = { en: "en-US", es: "es-MX", "pt-br": "pt-BR" };
const amount = (units: bigint, symbol: string): FactValue => ({ type: "amount", units, decimals: 6, symbol });

function factsFor(receipt: ChainReceipt): { facts: Facts; ruleId: TimelineReceipt["ruleId"]; kind: TimelineReceipt["kind"] } {
  if (receipt.type === "split") {
    const symbol = receipt.asset === 2 ? "EURC" : "USDC";
    const values: Record<string, FactValue> = { total: amount(receipt.total, symbol) };
    for (const box of BOX_KINDS) values[box] = amount(receipt.byBox[box] ?? 0n, symbol);
    // the brain's split text prints a percentage for Taxes: here it is this payment's share, and the receipt says so
    values.rate = { type: "bps", value: receipt.total === 0n ? 0 : Number(((receipt.byBox.taxes ?? 0n) * 10_000n) / receipt.total) };
    return { facts: { kind: "split", values, labels: {} }, ruleId: "cascade", kind: "split" };
  }
  if (receipt.type === "salary") {
    return { facts: { kind: "salary", values: { amount: amount(receipt.amount, receipt.asset === 2 ? "EURC" : "USDC") }, labels: {} }, ruleId: "salary-day", kind: "salary" };
  }
  return { facts: { kind: "payment", values: { amount: amount(receipt.amount, "USDC") }, labels: { to: shortAddress(receipt.recipient) } }, ruleId: "private-spend", kind: "payment" };
}

export function buildReceipts(receipts: ChainReceipt[], locale: Locale): TimelineReceipt[] {
  return [...receipts]
    .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber < b.blockNumber ? 1 : -1))
    .map((receipt) => {
      const { facts, ruleId, kind } = factsFor(receipt);
      const built = buildReceipt({ kind: facts.kind, ruleId, facts, createdAt: receipt.timestamp, sequence: receipt.logIndex, styles: { [LANG[locale]]: STYLE[locale] } });
      const parts = receipt.type === "split" ? BOX_KINDS.filter((box) => (receipt.byBox[box] ?? 0n) > 0n).map((box) => ({ box, units: receipt.byBox[box] as bigint })) : [];
      return {
        type: "receipt" as const,
        id: `${receipt.txHash}:${receipt.logIndex}`,
        at: receipt.timestamp,
        kind,
        ruleId,
        text: built.texts[LANG[locale]],
        parts,
        total: receipt.type === "split" ? receipt.total : receipt.amount,
        txHash: receipt.txHash,
        undo: { undoable: false as const, reason: UNDO_REASON[kind] },
      };
    });
}
