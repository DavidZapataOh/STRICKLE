"use client";

import { sourceChain } from "@strickle/arc/bridge/chains";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { type Hex, getAddress } from "viem";
import { appNetwork } from "@/config/network";
import { depositReducer, initialDeposit } from "@/deposit/flow";
import { errorOf } from "@/deposit/messages";
import { clearPending, loadPending, savePending } from "@/deposit/pending";
import type { Locale } from "@/i18n/config";
import type { DepositText } from "@/i18n/slices";
import type { Account } from "@/settings/account";
import { type InjectedWallet, discoverWallets } from "@/wallet/injected";
import { DepositView } from "./DepositView";

type Bridge = typeof import("@strickle/arc/bridge");

const POLL_MS = 5_000;
const GIVE_UP_MS = 15 * 60_000;
const QUOTE_DEBOUNCE_MS = 400;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The wallet and kit work of the deposit screen. The bridge code is imported only after a wallet is chosen. */
export function DepositActive({ lang, t, account }: { lang: Locale; t: DepositText; account: Account }) {
  const [state, dispatch] = useReducer(depositReducer, undefined, () => initialDeposit(appNetwork()));
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  const [discovered, setDiscovered] = useState(false);
  const [round, setRound] = useState(0);
  const bridge = useRef<{ module: Bridge; kit: ReturnType<Bridge["createDepositKit"]>; adapter: Awaited<ReturnType<Bridge["adapterFromProvider"]>>; provider: InjectedWallet["provider"] } | null>(null);
  const latestQuote = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const follow = useCallback(async (id: string) => {
    const deadline = Date.now() + GIVE_UP_MS;
    while (alive.current && Date.now() < deadline) {
      try {
        const response = await fetch(`/api/deposits/${id}`, { cache: "no-store" });
        const body = (await response.json()) as { status: string; deposit?: { state: string; received?: string; forwardTx?: string; appliedSpeed?: "fast" | "slow" } };
        if (body.status === "ok" && body.deposit) {
          if (body.deposit.appliedSpeed) dispatch({ type: "speed-applied", value: body.deposit.appliedSpeed });
          if (body.deposit.state === "arrived" && body.deposit.received) {
            clearPending();
            dispatch({ type: "arrived", received: BigInt(body.deposit.received), ...(body.deposit.forwardTx ? { forwardTx: body.deposit.forwardTx as Hex } : {}) });
            return;
          }
        }
        if (body.status === "not-found") {
          clearPending();
          dispatch({ type: "failed", error: "unavailable" });
          return;
        }
      } catch {
        // a dropped request is retried on the next turn
      }
      await sleep(POLL_MS);
    }
    if (alive.current) dispatch({ type: "failed", error: "timeout" });
  }, []);

  // a deposit whose burn was sent before the page closed is followed again, not forgotten
  useEffect(() => {
    const pending = loadPending();
    if (!pending) return;
    dispatch({ type: "sending", depositId: pending.id });
    dispatch({ type: "burned", burnTx: pending.burnTx });
    void follow(pending.id);
  }, [follow]);

  const { sourceId, amount, speed, account: sender, network } = state;

  // ask for a quote whenever what is being deposited changes; an older answer never overwrites a newer one
  useEffect(() => {
    const connection = bridge.current;
    if (!sourceId || !amount || !sender || !connection) return;
    const ticket = ++latestQuote.current;
    const timer = setTimeout(async () => {
      try {
        const quote = await connection.module.quoteDeposit(
          { kit: connection.kit, adapter: connection.adapter },
          { network, source: sourceChain(network, sourceId), sourceAddress: sender, vault: account.vault, amountSent: amount, speed },
        );
        if (ticket === latestQuote.current && alive.current) dispatch({ type: "quoted", quote });
      } catch (error) {
        if (ticket !== latestQuote.current || !alive.current) return;
        const code = (error as { code?: string }).code;
        if ((error as { name?: string }).name === "QuoteRefusal" && code) dispatch({ type: "refused", code });
        else dispatch({ type: "failed", error: errorOf(error) });
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // the connection is a ref: it changes together with state.account
  }, [sourceId, amount, speed, sender, network, account.vault, round]);

  async function connect() {
    setWallets(await discoverWallets());
    setDiscovered(true);
  }

  async function pick(wallet: InjectedWallet) {
    try {
      const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as string[];
      const first = accounts[0];
      if (!first) throw new Error("the wallet returned no account");
      const bridgeModule = await import("@strickle/arc/bridge");
      bridge.current = { module: bridgeModule, kit: bridgeModule.createDepositKit(), adapter: await bridgeModule.adapterFromProvider(wallet.provider, state.network), provider: wallet.provider };
      dispatch({ type: "wallet", wallet, account: getAddress(first) });
    } catch (error) {
      dispatch({ type: "failed", error: errorOf(error) });
    }
  }

  async function register(id: string, burnTx: Hex) {
    const deadline = Date.now() + GIVE_UP_MS;
    while (alive.current && Date.now() < deadline) {
      const response = await fetch(`/api/deposits/${id}`, json({ burnTx })).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { status?: string; retryAfterSeconds?: number } | null;
      if (body?.status === "ok") return;
      if (body?.status === "rejected" && body.retryAfterSeconds) await sleep(body.retryAfterSeconds * 1000);
      else if (!body || body.status === "unavailable") await sleep(POLL_MS);
      else return;
    }
  }

  async function confirm() {
    const { quote, sourceId, speed, account: sender } = state;
    const connection = bridge.current;
    const leg = quote?.legs[0];
    if (!quote || !sourceId || !sender || !connection || !leg) return;
    let burned = false;
    try {
      const created = await fetch("/api/deposits", json({ vault: account.vault, sourceChain: sourceId, sourceAddress: sender, amount: quote.amountSent.toString(), speed, feeMode: leg.feeMode, intent: "income" }));
      const record = (await created.json()) as { status: string; id?: string };
      if (record.status !== "created" || !record.id) throw new Error(`the deposit was not recorded: ${record.status}`);
      const id = record.id;
      dispatch({ type: "sending", depositId: id });
      const kit = connection.module.createDepositKit();
      const adapter = await connection.module.adapterFromProvider(connection.provider, state.network);
      // the kit's promise runs on until Circle delivers; the burn is what the screen follows
      void connection.module
        .executeDeposit({ kit, adapter }, quote, (progress) => {
          if (progress.stage !== "burn" || progress.state !== "done" || !progress.txHash || burned) return;
          burned = true;
          savePending(id, progress.txHash);
          dispatch({ type: "burned", burnTx: progress.txHash });
          void register(id, progress.txHash).then(() => follow(id));
        })
        .catch((error: unknown) => {
          if (!burned && alive.current) dispatch({ type: "failed", error: errorOf(error) });
        });
    } catch (error) {
      dispatch({ type: "failed", error: errorOf(error) });
    }
  }

  function check() {
    const pending = loadPending();
    if (!pending) return;
    dispatch({ type: "sending", depositId: pending.id });
    dispatch({ type: "burned", burnTx: pending.burnTx });
    void follow(pending.id);
  }

  return (
    <DepositView
      lang={lang}
      t={t}
      state={state}
      wallets={wallets}
      discovered={discovered}
      vault={account.vault}
      onEvent={(event) => {
        if (event.type === "failed" && event.error === "quote-expired") setRound((value) => value + 1);
        dispatch(event);
      }}
      actions={{ connect: () => void connect(), pick: (wallet) => void pick(wallet), confirm: () => void confirm(), check, refresh: () => setRound((value) => value + 1) }}
    />
  );
}
