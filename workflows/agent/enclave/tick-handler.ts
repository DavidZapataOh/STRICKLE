// workflows/agent/enclave/tick-handler.ts
import type { TeeRuntime } from "@chainlink/cre-sdk";
import { type Address, bytesToHex, getAddress } from "viem";
import type { Config } from "../config.ts";
import { decodeDelegated, decodeHead, decodeStateLog, decodeTickBooks, delegatedRequest, headRequest, stateLogRequest, tickRequests } from "./books.ts";
import { ASSET_ID } from "./cascade.ts";
import { todayOf, windowSeed } from "./clock.ts";
import { deliver } from "./deliver.ts";
import { decryptState, encryptState, parseMaster } from "./keys.ts";
import { decodeProfile, encodeProfile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { encodeSalaryReport, encodeTickReport } from "./reports.ts";
import { planTick } from "./tick.ts";

export const MAX_PER_RUN = 5;
const LIST_LIMIT = 10;

export const onDailyTick = (runtime: TeeRuntime<Config>): string => {
  const executor = runtime.config.executorAddress as Address;
  const state = runtime.config.stateAddress as Address;

  // The tick runs hourly and takes LIST_LIMIT vaults, so the scan start moves by LIST_LIMIT per run and covers the registry in turns.
  const seed = windowSeed(runtime.now().getTime(), 3_600_000, LIST_LIMIT);
  const [listAnswer] = ethBatch(runtime, [delegatedRequest(executor, seed, LIST_LIMIT)]);
  const vaults = decodeDelegated(listAnswer);
  if (vaults.length === 0) return "ok";

  // Heads first (one cheap call each), then the full books only for the vaults updated longest ago.
  const heads = ethBatch(runtime, vaults.map((vault) => headRequest(state, vault)));
  const stalest = vaults
    .map((vault, index) => ({ vault, ...decodeHead(heads[index]) }))
    .filter((entry) => entry.version > 0n)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(0, MAX_PER_RUN);
  if (stalest.length === 0) return "ok";

  const master = parseMaster(runtime.getSecret({ id: "AGENT_MASTER" }).result().value);
  const answers = ethBatch(runtime, stalest.flatMap((entry) => tickRequests(state, entry.vault)));
  const books = stalest.map((_, index) => decodeTickBooks(answers.slice(index * 14, index * 14 + 14)));
  const logs = ethBatch(runtime, books.map((entry, index) => stateLogRequest(state, (stalest[index] as { vault: Address }).vault, entry.version, entry.at)));

  stalest.forEach((entry, position) => {
    try {
      const current = books[position];
      const vault = getAddress(entry.vault);
      const profile = decodeProfile(decryptState(master, vault, current.version, decodeStateLog(logs[position])));
      const today = todayOf(runtime.now(), runtime.config.sandboxClock ? profile.clockOffsetDays : 0);
      const plan = planTick(profile, current.books, today, vault);
      if (plan.kind === "skip") return;
      const next = current.version + 1n;
      const ciphertext = bytesToHex(encryptState(master, vault, next, encodeProfile(plan.next)));
      deliver(
        runtime,
        executor,
        plan.kind === "salary"
          ? encodeSalaryReport({ vault, asset: ASSET_ID.USDC, payee: plan.payee, amount: plan.amount, seen: plan.seen, next, ciphertext })
          : encodeTickReport({ vault, next, ciphertext }),
      );
    } catch {
      // a vault that cannot be processed now is left for a later run; nothing about it may be logged
    }
  });
  return "ok";
};
