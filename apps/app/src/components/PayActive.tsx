"use client";

import { MEMO_ADDRESS, encodeMemoPayment } from "@strickle/arc/memo";
import { networks } from "@strickle/arc/networks";
import { useCallback, useRef, useState } from "react";
import { type Address, type Hex, numberToHex } from "viem";
import { appNetwork } from "@/config/network";
import type { Locale } from "@/i18n/config";
import type { PayText } from "@/i18n/slices";
import type { PublicInvoice } from "@/server/pay";
import { type InjectedWallet, discoverWallets } from "@/wallet/injected";
import { DepositActive } from "./DepositActive";
import { type PayPhase, PayView } from "./PayView";

const CLAIM_RETRY_MS = 10_000;
const CLAIM_GIVE_UP_MS = 60_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The wallet side of the payer's page: pay on Arc with a memo, pay from another chain through the deposit flow, or copy the address. */
export function PayActive({ lang, t, token, invoice, onPaid }: { lang: Locale; t: PayText; token: string; invoice: PublicInvoice; onPaid: () => void }) {
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);
  const [copyNote, setCopyNote] = useState("");
  const busy = useRef(false);
  const remaining = BigInt(invoice.remaining);

  const claim = useCallback(
    async (txHash: Hex) => {
      const deadline = Date.now() + CLAIM_GIVE_UP_MS;
      while (Date.now() < deadline) {
        const response = await fetch(`/api/pay/${token}/claim`, json({ txHash })).catch(() => null);
        const body = (await response?.json().catch(() => null)) as { status?: string; result?: string } | null;
        if (body?.status === "claimed" && (body.result === "credited" || body.result === "extra" || body.result === "duplicate")) {
          setPhase("thanks");
          onPaid();
          return;
        }
        if (body?.status === "claimed" && body.result === "none") break;
        await sleep(CLAIM_RETRY_MS);
      }
      setPhase("failed");
    },
    [token, onPaid],
  );

  async function pay(wallet: InjectedWallet) {
    if (busy.current) return;
    busy.current = true;
    try {
      setPhase("connecting");
      const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as Address[];
      const from = accounts[0];
      if (!from) throw new Error("no account");
      const network = networks[appNetwork()];
      const chainId = numberToHex(network.chain.id);
      try {
        await wallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
      } catch {
        await wallet.provider.request({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: network.chain.name, nativeCurrency: network.chain.nativeCurrency, rpcUrls: [network.rpcUrl], blockExplorerUrls: [network.explorerUrl] }] });
      }
      // Memo forwards the call as its caller, and a smart account is refused by the contract: only a plain account can attach the reference
      const code = (await wallet.provider.request({ method: "eth_getCode", params: [from, "latest"] })) as string;
      if (code !== "0x") {
        setPhase("needEoa");
        return;
      }
      setPhase("sending");
      const call = encodeMemoPayment({ token: invoice.usdc, vault: invoice.vault, amount: remaining, memoId: invoice.memoId });
      const txHash = (await wallet.provider.request({ method: "eth_sendTransaction", params: [{ from, to: MEMO_ADDRESS, data: call.data }] })) as Hex;
      setPhase("confirming");
      await claim(txHash);
    } catch {
      setPhase("failed");
    } finally {
      busy.current = false;
    }
  }

  async function connect() {
    setPhase("connecting");
    const found = await discoverWallets();
    if (found.length === 0) setPhase("noWallet");
    else if (found.length === 1 && found[0]) await pay(found[0]);
    else {
      setWallets(found);
      setPhase("choose");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(invoice.vault);
      setCopyNote(t.pay.copied);
    } catch {
      setCopyNote(t.pay.copyFailed);
    }
  }

  return (
    <PayView
      lang={lang}
      t={t}
      invoice={invoice}
      phase={phase}
      wallets={wallets}
      otherOpen={otherOpen}
      copyNote={copyNote}
      actions={{ arc: () => void connect(), pick: (wallet) => void pay(wallet), other: () => setOtherOpen(true), copy: () => void copy() }}
      otherSlot={<DepositActive lang={lang} t={t} account={{ vault: invoice.vault }} endpoint={`/api/pay/${token}/deposits`} scope={token} target={remaining} />}
    />
  );
}
