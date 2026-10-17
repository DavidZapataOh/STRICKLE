// workflows/agent/enclave/deposit-handler.ts
import type { TeeRuntime } from "@chainlink/cre-sdk";
import { type Address, type Hex, bytesToHex, getAddress, hexToBigInt, hexToBytes } from "viem";
import type { Config } from "../config.ts";
import { booksRequests, decodeBooks, decodeNoticeCount, decodePending, decodeStateLog, noticeCountRequest, onePerVault, pendingRequest, stateLogRequest } from "./books.ts";
import { planArrivals } from "./arrivals.ts";
import { ASSET_ID } from "./cascade.ts";
import { todayOf } from "./clock.ts";
import { deliver } from "./deliver.ts";
import { decryptState, encryptState, parseMaster } from "./keys.ts";
import { attribute, decodeMoves, decodeTransfers, logWindow, transfersRequest, vaultMovesRequest } from "./flow.ts";
import { sealNotice } from "./notices.ts";
import { ZERO_KEY, decodeProfile, encodeProfile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { encodeNoticeReport } from "./reports.ts";
import { blockNumberRequest } from "./rpc.ts";
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

  // one head for the whole run, so every read of a vault looks at the same block
  const head = ready.length === 0 ? 0n : hexToBigInt(ethBatch(runtime, [blockNumberRequest()])[0] as Hex);

  ready.forEach(({ item, books }, position) => {
    try {
      const vault = getAddress(item.vault);
      const asset = ASSETS[item.asset - 1];
      const profile = decodeProfile(decryptState(master, vault, books.version, decodeStateLog(logs[position])));
      const today = todayOf(runtime.now(), runtime.config.sandboxClock ? profile.clockOffsetDays : 0);
      const token = (asset === "USDC" ? runtime.config.usdcAddress : runtime.config.eurcAddress) as Address;
      // what arrived since the last checkpoint
      const sinceCheckpoint = profile.flow.checkpoint !== "" ? BigInt(profile.flow.checkpoint) + 1n : books.at;
      const from = logWindow(head, sinceCheckpoint);
      const [moves, rawTransfers, noticeAnswer] = ethBatch(runtime, [vaultMovesRequest(vault, from, head), transfersRequest(token, vault, from, head), noticeCountRequest(state, vault)]);
      const attribution = attribute({ transfers: decodeTransfers(rawTransfers, token, asset, decodeMoves(moves)), unallocated: item.amount, head });
      // a transfer is in the logs but the balance read has not caught up: this vault waits for the next run
      if (attribution === "race") return;
      const plan = planArrivals({
        profile,
        books: { asset, unallocated: item.amount, operating: books.operating, payrollFunded: books.payrollFunded, emergency: books.emergency },
        arrivals: attribution.arrivals.map((transfer) => ({ id: transfer.id, asset, amount: transfer.amount, sender: transfer.sender, date: today })),
        unexplained: attribution.unexplained,
        checkpoint: attribution.checkpoint,
        today,
        now: Math.floor(runtime.now().getTime() / 1000),
      });
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
      if (profile.userKey !== ZERO_KEY && plan.notices.length > 0) {
        const userKey = hexToBytes(profile.userKey as Hex);
        const count = decodeNoticeCount(noticeAnswer);
        plan.notices.forEach((notice, index) => {
          const id = count + BigInt(index) + 1n;
          deliver(runtime, executor, encodeNoticeReport({ vault, id, sealed: bytesToHex(sealNotice(master, userKey, vault, id, notice)) }));
        });
      }
    } catch {
      // a vault that cannot be processed now is left for a later run; nothing about it may be logged
    }
  });
  return "ok";
};
