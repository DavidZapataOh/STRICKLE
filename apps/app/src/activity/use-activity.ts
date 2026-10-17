"use client";

import type { Locale } from "@strickle/design/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { getPublicClient } from "@/chain/client";
import { executorFirstBlock } from "@/config/network";
import type { NoticeKey } from "@/keys/notice-key";
import { readActivity } from "./read";
import { type TimelineProposal, type TimelineReceipt, buildReceipts, foldProposals, openNotices } from "./timeline";
import type { Activity, SealedNotice } from "./types";

const POLL_MS = 15_000;
const OVERLAP_BLOCKS = 10n;

const empty = (): Activity => ({ receipts: [], notices: [], head: executorFirstBlock(), truncated: false });
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Reads the vault's receipts and notices: everything the first time, then only what is newer, again every fifteen seconds while the tab is visible. */
export function useActivity(args: { vault: Address; key: NoticeKey | null; locale: Locale }) {
  const { vault, key, locale } = args;
  const [loaded, setLoaded] = useState<{ status: "loading" | "ready" | "error"; data: Activity | null; at: number }>({ status: "loading", data: null, at: 0 });
  const cursor = useRef<bigint>(executorFirstBlock());
  const merged = useRef<Activity>(empty());
  const spent = useRef(new Map<Hex, { amount: bigint; recipient: Address }>());

  const load = useCallback(async () => {
    try {
      const next = await readActivity({ client: getPublicClient(), vault, fromBlock: cursor.current, known: spent.current });
      const seen = new Set(merged.current.receipts.map((item) => `${item.txHash}:${item.logIndex}`));
      const seenNotices = new Set(merged.current.notices.map((item) => item.id));
      merged.current = {
        head: next.head,
        truncated: merged.current.truncated || next.truncated,
        receipts: [...merged.current.receipts, ...next.receipts.filter((item) => !seen.has(`${item.txHash}:${item.logIndex}`))],
        notices: [...merged.current.notices, ...next.notices.filter((item) => !seenNotices.has(item.id))],
      };
      // a few blocks of overlap cover a reorganization; de-duplication by transaction hash and log index keeps the list stable
      const advanced = next.head - OVERLAP_BLOCKS;
      if (advanced > cursor.current) cursor.current = advanced;
      setLoaded({ status: "ready", data: { ...merged.current }, at: nowSeconds() });
    } catch {
      setLoaded((current) => (current.status === "ready" ? { ...current, at: nowSeconds() } : { status: "error", data: null, at: nowSeconds() }));
    }
  }, [vault]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const sealed: SealedNotice[] = useMemo(() => loaded.data?.notices ?? [], [loaded.data]);
  const opened = useMemo(() => openNotices(sealed, vault, key), [sealed, vault, key]);
  const receipts: TimelineReceipt[] = useMemo(() => (loaded.data ? buildReceipts(loaded.data.receipts, locale) : []), [loaded.data, locale]);
  const proposals: TimelineProposal[] = useMemo(() => foldProposals(opened, loaded.at), [opened, loaded.at]);

  const notices = useMemo(() => [...opened].sort((a, b) => (a.id < b.id ? -1 : 1)).flatMap((item) => (item.notice ? [item.notice] : [])), [opened]);

  return {
    status: loaded.status,
    notices,
    receipts,
    proposals,
    sealed,
    now: loaded.at,
    unreadable: opened.filter((item) => item.notice === null).length,
    truncated: loaded.data?.truncated ?? false,
    reload: () => void load(),
  };
}
