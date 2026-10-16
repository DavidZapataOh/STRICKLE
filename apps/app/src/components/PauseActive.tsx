"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { getPublicClient } from "@/chain/client";
import type { Dictionary } from "@/i18n/dictionaries";
import { settingsReadAbi } from "@/settings/abi";
import type { Account } from "@/settings/account";
import { pauseCalls, resumeCalls } from "@/settings/calls";
import { sendOwnerCalls } from "@/settings/send";
import { type TxPhase, runTx } from "@/settings/tx";
import { isPasskeyCancelled } from "@/wallet/errors";

const readPaused = (vault: Address) => getPublicClient().readContract({ address: vault, abi: settingsReadAbi, functionName: "agentPaused" }) as Promise<boolean>;

/** Pauses and resumes the agent with the owner's own transaction on the vault: nothing here needs the workflow, so it works when the workflow is down. */
export function PauseActive({ account, labels }: { account: Account; labels: Dictionary["pause"] }) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [round, setRound] = useState(0);
  const { vault } = account;

  useEffect(() => {
    const read = async () => {
      try {
        setPaused(await readPaused(vault));
      } catch {
        setPaused(null);
      }
    };
    void read();
    const tick = () => {
      if (document.visibilityState === "visible") void read();
    };
    const id = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [vault, round]);

  const busy = phase === "signing" || phase === "confirming";
  const resuming = paused === true;

  async function toggle() {
    const target = resuming ? "resume" : "pause";
    const outcome = await runTx(
      {
        send: () => sendOwnerCalls(account, target === "pause" ? pauseCalls(vault) : resumeCalls(vault)),
        confirmed: async () => (await readPaused(vault)) === (target === "pause"),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: Date.now,
        isCancelled: isPasskeyCancelled,
      },
      setPhase,
    );
    if (outcome === "done") setPaused(target === "pause");
    else setRound((value) => value + 1);
  }

  return (
    <div className="pause" role="group" aria-label={labels.region}>
      {resuming ? <span className="chip">{labels.paused}</span> : null}
      <button type="button" className="btn pause-btn" data-variant={resuming ? "primary" : "quiet"} onClick={toggle} disabled={busy}>
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          {resuming ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM13 5h4v14h-4z" />}
        </svg>
        <span className="pause-long">{resuming ? labels.resume : labels.pause}</span>
        <span className="pause-short">{resuming ? labels.resumeShort : labels.short}</span>
      </button>
      <p className="pause-status" role="status" aria-live="polite">
        {phase === "idle" ? "" : labels[phase]}
      </p>
    </div>
  );
}
