// workflows/agent/enclave/tick-handler.ts
import type { TeeRuntime } from "@chainlink/cre-sdk";
import { BOX_KINDS, toUsdc } from "@strickle/core";
import { type Address, type Hex, bytesToHex, getAddress, hexToBytes } from "viem";
import type { Config } from "../config.ts";
import { decodeDelegated, decodeHead, decodeStateLog, decodeTickBooks, delegatedRequest, headRequest, stateLogRequest, tickRequests } from "./books.ts";
import { ASSET_ID } from "./cascade.ts";
import { todayOf, windowSeed } from "./clock.ts";
import { deliver } from "./deliver.ts";
import { decryptState, encryptState, parseMaster } from "./keys.ts";
import { sealNotice } from "./notices.ts";
import { ZERO_KEY, decodeProfile, encodeProfile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { encodeNoticeReport, encodeSalaryReport, encodeSwapReport, encodeTickReport } from "./reports.ts";
import { chainOf, circleQuote } from "./swap-call.ts";
import { convert } from "./swap-handle.ts";
import { planTick } from "./tick.ts";

export const MAX_PER_RUN = 5;
const LIST_LIMIT = 10;
const READS_PER_VAULT = 25;
const STORED_RATE_DAYS = 7;

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
  const { swap: swapConfig } = runtime.config;
  const nowSeconds = Math.floor(runtime.now().getTime() / 1000);
  const answers = ethBatch(runtime, stalest.flatMap((entry) => tickRequests(state, entry.vault, { usdcFeed: swapConfig.usdcFeed as Address, eurcFeed: swapConfig.eurcFeed as Address })));
  const books = stalest.map((_, index) => decodeTickBooks(answers.slice(index * READS_PER_VAULT, (index + 1) * READS_PER_VAULT), { now: nowSeconds, maxAgeSeconds: swapConfig.maxFeedAgeSeconds }));
  const logs = ethBatch(runtime, books.map((entry, index) => stateLogRequest(state, (stalest[index] as { vault: Address }).vault, entry.version, entry.at)));

  stalest.forEach((entry, position) => {
    try {
      const current = books[position];
      const vault = getAddress(entry.vault);
      const profile = decodeProfile(decryptState(master, vault, current.version, decodeStateLog(logs[position])));
      const today = todayOf(runtime.now(), runtime.config.sandboxClock ? profile.clockOffsetDays : 0);
      const swapReads = current.swap;
      // a stale feed values the euros at the last rate the agent stored when it is recent, and leaves them out otherwise
      const stored = BigInt(profile.rate.usdcUsd) > 0n && BigInt(profile.rate.eurcUsd) > 0n && nowSeconds - profile.rate.at <= STORED_RATE_DAYS * 86_400 ? { usdcUsd: BigInt(profile.rate.usdcUsd), eurcUsd: BigInt(profile.rate.eurcUsd) } : undefined;
      let tickBooks = current.books;
      if (swapReads && swapReads.rate === "stale" && stored) {
        const boxes = Object.fromEntries(BOX_KINDS.map((kind) => [kind, swapReads.raw.usdc[kind] + toUsdc("EURC", swapReads.raw.eurc[kind], stored)])) as typeof current.books.boxes;
        tickBooks = { ...current.books, boxes };
      }
      // the salary is paid in dollars: only dollars in its box count towards it, so the report's `seen` is the real balance
      if (swapReads) tickBooks = { ...tickBooks, boxes: { ...tickBooks.boxes, salary: swapReads.raw.usdc.salary } };
      const plan = planTick(profile, tickBooks, today, vault, nowSeconds);
      const base = plan.kind === "skip" ? profile : plan.next;
      const conversion = swapReads
        ? convert({ profile: base, vault, swap: swapReads, today, now: nowSeconds, config: swapConfig, usdc: runtime.config.usdcAddress as Address, eurc: runtime.config.eurcAddress as Address, chain: chainOf(runtime.config), quote: (body) => circleQuote(runtime, body) })
        : { kind: "none" as const, next: base };
      const seal = (profileNext: typeof base, version: bigint) => bytesToHex(encryptState(master, vault, version, encodeProfile(profileNext)));
      let version = current.version;
      const notices = plan.kind === "skip" ? [] : [...plan.notices];

      if (conversion.kind === "held") {
        // one state report carries the tick's own changes and the counters of the held conversion
        version += 1n;
        const held = { ...conversion.next };
        deliver(runtime, executor, plan.kind === "salary" ? encodeSalaryReport({ vault, asset: ASSET_ID.USDC, payee: plan.payee, amount: plan.amount, seen: plan.seen, next: version, ciphertext: seal(held, version) }) : encodeTickReport({ vault, next: version, ciphertext: seal(held, version) }));
        notices.push(...conversion.notices);
      } else {
        if (plan.kind !== "skip") {
          version += 1n;
          deliver(runtime, executor, plan.kind === "salary" ? encodeSalaryReport({ vault, asset: ASSET_ID.USDC, payee: plan.payee, amount: plan.amount, seen: plan.seen, next: version, ciphertext: seal(plan.next, version) }) : encodeTickReport({ vault, next: version, ciphertext: seal(plan.next, version) }));
        }
        if (conversion.kind === "swap") {
          const after = version + 1n;
          try {
            deliver(runtime, executor, encodeSwapReport({ vault, box: conversion.intent.box, assetIn: ASSET_ID[conversion.intent.assetIn], amountIn: conversion.intent.amountIn, minOut: conversion.intent.minOut, seen: conversion.seen, data: conversion.data, next: after, ciphertext: seal(conversion.next, after) }), conversion.gasLimit.toString());
            version = after;
            notices.push(...conversion.notices);
          } catch {
            // the vault refused the swap, which leaves the state where it was: count the failure the same way a refused quote is counted
            version = after;
            deliver(runtime, executor, encodeTickReport({ vault, next: after, ciphertext: seal(conversion.failed.next, after) }));
            notices.push(...conversion.failed.notices);
          }
        }
      }

      if (profile.userKey !== ZERO_KEY && notices.length > 0) {
        const userKey = hexToBytes(profile.userKey as Hex);
        notices.forEach((notice, offset) => {
          const id = current.notices + BigInt(offset) + 1n;
          deliver(runtime, executor, encodeNoticeReport({ vault, id, sealed: bytesToHex(sealNotice(master, userKey, vault, id, notice)) }));
        });
      }
    } catch {
      // a vault that cannot be processed now is left for a later run; nothing about it may be logged
    }
  });
  return "ok";
};
