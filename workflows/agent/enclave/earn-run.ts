import type { TeeRuntime } from "@chainlink/cre-sdk";
import type { PlainDate } from "@strickle/core";
import type { Address } from "viem";
import type { Config } from "../config.ts";
import { BOX_ID } from "./cascade.ts";
import { circleEarn } from "./earn-call.ts";
import { earnAllowed } from "./earn-allowed.ts";
import { type EarnOutcome, type EarnReads, earnMove, expireStale } from "./earn-handle.ts";
import { decodeEarnFirst, decodeEarnPreview, earnFirstReads, earnPreviewRead } from "./earn-reads.ts";
import type { Profile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import type { TickBooks } from "./tick.ts";

/** One move for one vault, read and decided in batches of their own: a vault or a service that cannot answer costs this move, never the tick. */
export function earnFor(runtime: TeeRuntime<Config>, input: { profile: Profile; vault: Address; books: TickBooks; today: PlainDate; nowSeconds: number }): EarnOutcome {
  const { profile, vault } = input;
  const intent = [...profile.earn.pending].sort((a, b) => a.at - b.at)[0];
  if (!intent) return { kind: "none", next: profile };
  try {
    const earnVault = intent.vault as Address;
    const first = decodeEarnFirst(ethBatch(runtime, earnFirstReads(vault, earnVault, BOX_ID[intent.box])));
    const [answer] = ethBatch(runtime, [earnPreviewRead(earnVault, intent.deposit, BigInt(intent.amount), first.owned)]);
    const preview = decodeEarnPreview(answer, intent.deposit);
    const reads: EarnReads = { ...first, previewShares: intent.deposit ? preview : 0n, position: intent.deposit ? 0n : preview };
    return earnMove({
      profile,
      vault,
      reads,
      today: input.today,
      now: input.nowSeconds,
      config: runtime.config,
      usdc: runtime.config.usdcAddress as Address,
      chain: runtime.config.chainId === 5042 ? "ARC" : "ARC-TESTNET",
      quote: (path, body) => circleEarn(runtime, path, body),
      allowed: (move) => earnAllowed(profile, input.books, input.today, move),
    });
  } catch {
    // a vault that cannot answer costs this run, but a request that has waited a day is dropped and told
    return expireStale({ profile, config: runtime.config, now: input.nowSeconds }) ?? { kind: "none", next: profile };
  }
}
