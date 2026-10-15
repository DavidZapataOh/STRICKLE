// workflows/agent/enclave/deposit-handler.ts
import type { TeeRuntime } from "@chainlink/cre-sdk";
import { type Address, bytesToHex, getAddress } from "viem";
import type { Config } from "../config.ts";
import { booksRequests, decodeBooks, decodePending, decodeStateLog, onePerVault, pendingRequest, stateLogRequest } from "./books.ts";
import { ASSET_ID, planSplit } from "./cascade.ts";
import { todayOf } from "./clock.ts";
import { deliver } from "./deliver.ts";
import { decryptState, encryptState, parseMaster } from "./keys.ts";
import { decodeProfile, encodeProfile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { encodeSplitReport } from "./split-report.ts";

export const MAX_PER_RUN = 5;
const LIST_LIMIT = 10;
const ASSETS = ["USDC", "EURC"] as const;

export const onDepositPoll = (runtime: TeeRuntime<Config>): string => {
  const executor = runtime.config.executorAddress as Address;
  const state = runtime.config.stateAddress as Address;

  // The seed moves every minute, so the contract serves the registry in turns and no vault can starve the others.
  const seed = Math.floor(runtime.now().getTime() / 60_000);
  const [pendingAnswer] = ethBatch(runtime, [pendingRequest(executor, seed, LIST_LIMIT)]);
  const list = onePerVault(decodePending(pendingAnswer));
  if (list.length === 0) return "ok";

  const master = parseMaster(runtime.getSecret({ id: "AGENT_MASTER" }).result().value);
  const answers = ethBatch(runtime, list.flatMap((item) => booksRequests(state, item.vault, item.asset)));
  const ready = list
    .map((item, index) => ({ item, books: decodeBooks(answers.slice(index * 4, index * 4 + 4)) }))
    .filter(({ books }) => books.version > 0n)
    .slice(0, MAX_PER_RUN);
  const logs = ready.length === 0 ? [] : ethBatch(runtime, ready.map(({ item, books }) => stateLogRequest(state, item.vault, books.version, books.at)));

  ready.forEach(({ item, books }, position) => {
    try {
      const vault = getAddress(item.vault);
      const asset = ASSETS[item.asset - 1];
      const profile = decodeProfile(decryptState(master, vault, books.version, decodeStateLog(logs[position])));
      const today = todayOf(runtime.now(), runtime.config.sandboxClock ? profile.clockOffsetDays : 0);
      const plan = planSplit(
        profile,
        {
          asset,
          unallocated: item.amount,
          operating: books.operating,
          payrollFunded: books.payrollFunded,
          emergency: books.emergency,
        },
        today,
      );
      const next = books.version + 1n;
      deliver(
        runtime,
        executor,
        encodeSplitReport({
          vault,
          asset: ASSET_ID[asset],
          seen: item.amount,
          boxes: plan.boxes,
          amounts: plan.amounts,
          next,
          ciphertext: bytesToHex(encryptState(master, vault, next, encodeProfile(plan.next))),
        }),
      );
    } catch {
      // a vault that cannot be processed now is left for a later run; nothing about it may be logged
    }
  });
  return "ok";
};
