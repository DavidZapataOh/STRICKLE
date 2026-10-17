// workflows/agent/enclave/deposit-handler.ts
import type { TeeRuntime } from "@chainlink/cre-sdk";
import { type Address, type Hex, bytesToHex, getAddress, hexToBigInt, hexToBytes } from "viem";
import type { Config } from "../config.ts";
import { booksRequests, decodeBooks, decodeNoticeCount, decodePending, decodeStateLog, noticeCountRequest, onePerVault, pendingRequest, stateLogRequest, valuedBooks } from "./books.ts";
import { planArrivals } from "./arrivals.ts";
import { ASSET_ID } from "./cascade.ts";
import { todayOf } from "./clock.ts";
import { deliver } from "./deliver.ts";
import { decodeRate, feedRequests, storedRate } from "./fx.ts";
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
const READS_PER_ITEM = 7;

export const onDepositPoll = (runtime: TeeRuntime<Config>): string => {
  const executor = runtime.config.executorAddress as Address;
  const state = runtime.config.stateAddress as Address;

  // The seed moves every minute, so the contract serves the registry in turns and no vault can starve the others.
  const seed = Math.floor(runtime.now().getTime() / 60_000);
  const [pendingAnswer] = ethBatch(runtime, [pendingRequest(executor, seed, LIST_LIMIT)]);
  const list = onePerVault(decodePending(pendingAnswer));
  if (list.length === 0) return "ok";

  const master = parseMaster(runtime.getSecret({ id: "AGENT_MASTER" }).result().value);
  const { swap: swapConfig } = runtime.config;
  const nowSeconds = Math.floor(runtime.now().getTime() / 1000);
  const answers = ethBatch(runtime, list.flatMap((item) => booksRequests(state, item.vault, item.asset, true)));
  // the feeds are read once per run in a batch of their own: a failed or stale read never stops a split, it only means no fresh rate
  let fresh: ReturnType<typeof decodeRate> = "stale";
  try {
    fresh = decodeRate(ethBatch(runtime, feedRequests(swapConfig.usdcFeed as Address, swapConfig.eurcFeed as Address)), nowSeconds, swapConfig.maxFeedAgeSeconds);
  } catch {
    fresh = "stale";
  }
  const ready = list
    .map((item, index) => ({ item, books: decodeBooks(answers.slice(index * READS_PER_ITEM, (index + 1) * READS_PER_ITEM)) }))
    .filter(({ books }) => books.version > 0n)
    .slice(0, MAX_PER_RUN);
  const logs = ready.length === 0 ? [] : ethBatch(runtime, ready.map(({ item, books }) => stateLogRequest(state, item.vault, books.version, books.at)));

  // one head for the whole run: the logs of every vault are read up to it; the balance is read at latest, so a deposit landing between the two shows as a race only when the logs exceed the balance
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
      const stored = storedRate(profile, nowSeconds);
      const rate = fresh === "stale" ? stored : fresh;
      const plan = planArrivals({
        profile,
        books: { asset, unallocated: item.amount, ...valuedBooks(asset, { operating: books.operating, payrollFunded: books.payrollFunded, emergency: books.emergency }, books.other, rate) },
        arrivals: attribution.arrivals.map((transfer) => ({ id: transfer.id, asset, amount: transfer.amount, sender: transfer.sender, date: today })),
        unexplained: attribution.unexplained,
        checkpoint: attribution.checkpoint,
        today,
        now: nowSeconds,
        ...(rate ? { rate } : {}),
      });
      if (fresh !== "stale") plan.next = { ...plan.next, rate: { usdcUsd: fresh.usdcUsd.toString(), eurcUsd: fresh.eurcUsd.toString(), at: nowSeconds } };
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
