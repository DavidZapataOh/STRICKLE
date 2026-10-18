"use client";
import { useCallback, useState } from "react";
import { type Outcome, type Phase } from "../agent/outcome.ts";
import { sendAgentAction } from "../agent/send.ts";
import { getPublicClient } from "../chain/client.ts";
import { fetchLogsFrom } from "../chain/logs.ts";
import { openedNotices } from "../chain/plan.ts";
import { loadNoticeKey } from "../keys/notice-key.ts";
import type { Account } from "../settings/account.ts";
import { isPasskeyCancelled } from "../wallet/errors.ts";
import { connectWallet } from "../wallet/passkey.ts";
import type { EarnAction } from "./actions.ts";
import { earnAnswered } from "./confirm.ts";

/**
 * Signs the request with the passkey, sends it through the relay and waits for a notice written after the send that answers it.
 * Only notices after the block read before sending count, so an older move cannot be mistaken for this one.
 */
export function useEarn(account: Account): { phase: Phase; run(action: EarnAction): Promise<Outcome> } {
  const [phase, setPhase] = useState<Phase>("idle");
  const run = useCallback(
    async (action: EarnAction): Promise<Outcome> => {
      const finish = (outcome: Outcome): Outcome => {
        setPhase(outcome.phase);
        return outcome;
      };
      setPhase("signing");
      let wallet;
      try {
        wallet = await connectWallet("login");
      } catch (error) {
        return finish({ phase: isPasskeyCancelled(error) ? "cancelled" : "failed", reason: "signing" });
      }
      const [key, baseline] = await Promise.all([loadNoticeKey(account.vault), getPublicClient().getBlockNumber()]);
      const outcome = await sendAgentAction({
        wallet,
        vault: account.vault,
        action,
        onPhase: setPhase,
        confirm: async () => {
          if (!key) return false;
          try {
            const logs = (await fetchLogsFrom("notice", account.vault, { fromBlock: baseline + 1n })).logs;
            return earnAnswered(openedNotices(logs, key, account.vault), action);
          } catch {
            return false;
          }
        },
      });
      return finish(outcome);
    },
    [account],
  );
  return { phase, run };
}
