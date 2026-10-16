"use client";
import type { PlanNotice } from "@strickle/agent/notice-schema";
import type { Action } from "@strickle/agent/signed";
import { useCallback, useState } from "react";
import { type Outcome, type Phase } from "../agent/outcome.ts";
import { sendAgentAction } from "../agent/send.ts";
import { getPublicClient } from "../chain/client.ts";
import { fetchLogsFrom } from "../chain/logs.ts";
import { latestPlan } from "../chain/plan.ts";
import { loadNoticeKey } from "../keys/notice-key.ts";
import { isPasskeyCancelled } from "../wallet/errors.ts";
import { connectWallet } from "../wallet/passkey.ts";
import type { Account } from "./account.ts";

type Request = Extract<Action, { kind: "adjust" | "resume" }>;

/**
 * Signs the request with the passkey, sends it through the relay and waits for a plan notice written after the send that shows the change in force.
 * Only notices after the block read before sending count, so a change A to B to A cannot be mistaken for the old A.
 */
export function useAdjust(account: Account): { phase: Phase; run(action: Request, expect: (plan: PlanNotice) => boolean): Promise<Outcome> } {
  const [phase, setPhase] = useState<Phase>("idle");
  const run = useCallback(
    async (action: Request, expect: (plan: PlanNotice) => boolean): Promise<Outcome> => {
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
            const plan = latestPlan((await fetchLogsFrom("notice", account.vault, { fromBlock: baseline + 1n })).logs, key, account.vault);
            return plan !== null && expect(plan);
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
