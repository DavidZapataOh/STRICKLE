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
  const run = useRef(0);
  const confirming = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Registers the burn (idempotent) until the server accepts it, then follows the deposit until it arrives. It never gives up: after the soft deadline it only says the transfer may still be on its way.
  const follow = useCallback(async (id: string, burnTx: Hex, ticket: number) => {
    const live = () => alive.current && run.current === ticket;
    const softDeadline = Date.now() + GIVE_UP_MS;
    let registered = false;
    let warned = false;
    while (live()) {
      let wait = POLL_MS;
      try {
        if (!registered) {
          const response = await fetch(`/api/deposits/${id}`, json({ burnTx }));
          const body = (await response.json()) as { status?: string; retryAfterSeconds?: number };
          if (body.status === "ok") registered = true;
          else if (body.status === "rejected" && body.retryAfterSeconds) wait = body.retryAfterSeconds * 1000;
          else if (body.status === "rejected" || body.status === "conflict" || body.status === "not-found") {
            if (live()) dispatch({ type: "failed", error: "unavailable" });
            return;
          }
        }
        if (registered) {
          const response = await fetch(`/api/deposits/${id}`, { cache: "no-store" });
          const body = (await response.json()) as { status: string; deposit?: { state: string; received?: string; forwardTx?: string; appliedSpeed?: "fast" | "slow" } };
          if (body.status === "ok" && body.deposit) {
            if (body.deposit.appliedSpeed && live()) dispatch({ type: "speed-applied", value: body.deposit.appliedSpeed });
            if (body.deposit.state === "arrived" && body.deposit.received) {
              if (live()) {
                clearPending();
                dispatch({ type: "arrived", received: BigInt(body.deposit.received), ...(body.deposit.forwardTx ? { forwardTx: body.deposit.forwardTx as Hex } : {}) });
              }
              return;
            }
          }
        }
      } catch {
        // a dropped request is retried on the next turn
      }
      if (!warned && Date.now() > softDeadline) {
        warned = true;
        if (live()) dispatch({ type: "failed", error: "timeout" });
      }
      await sleep(wait);
    }
  }, []);

  const resume = useCallback(
    (pending: { id: string; burnTx: Hex; speed?: "fast" | "slow"; sourceId?: string }) => {
      const ticket = ++run.current;
      if (pending.sourceId) dispatch({ type: "chain", id: pending.sourceId });
      if (pending.speed) dispatch({ type: "speed", value: pending.speed });
      dispatch({ type: "sending", depositId: pending.id });
      dispatch({ type: "burned", burnTx: pending.burnTx });
      void follow(pending.id, pending.burnTx, ticket);
    },
    [follow],
  );

  // a deposit whose burn was sent before the page closed is followed again, not forgotten
  useEffect(() => {
    const pending = loadPending();
    if (pending) resume(pending);
  }, [resume]);

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

  function fail(error: unknown) {
    confirming.current = false;
    const code = errorOf(error);
    if (code === "quote-expired") setRound((value) => value + 1);
    dispatch({ type: "failed", error: code });
  }

  async function confirm() {
    const { quote, sourceId: chosen, speed: chosenSpeed, account: from } = state;
    const connection = bridge.current;
    const leg = quote?.legs[0];
    if (!quote || !chosen || !from || !connection || !leg || confirming.current) return;
    confirming.current = true;
    let burned = false;
    try {
      // an expired quote is refused here, before any record exists and before the wallet is asked for anything
      connection.module.assertConfirmable(quote);
      const created = await fetch("/api/deposits", json({ vault: account.vault, sourceChain: chosen, sourceAddress: from, amount: quote.amountSent.toString(), speed: chosenSpeed, feeMode: leg.feeMode, intent: "income" }));
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
          confirming.current = false;
          savePending(id, progress.txHash, undefined, { speed: chosenSpeed, sourceId: chosen });
          const ticket = ++run.current;
          dispatch({ type: "burned", burnTx: progress.txHash });
          void follow(id, progress.txHash, ticket);
        })
        .catch((error: unknown) => {
          if (!burned && alive.current) fail(error);
        });
    } catch (error) {
      fail(error);
    }
  }

  function check() {
    const pending = loadPending();
    if (pending) resume(pending);
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
        if (event.type === "reset") {
          run.current++;
          clearPending();
        }
        dispatch(event);
      }}
      actions={{ connect: () => void connect(), pick: (wallet) => void pick(wallet), confirm: () => void confirm(), check, refresh: () => setRound((value) => value + 1) }}
    />
  );
}
