import type { TeeRuntime } from "@chainlink/cre-sdk";
import type { Address, Hex } from "viem";
import type { Config } from "../config.ts";
import { ASSET_ID } from "./cascade.ts";
import { deliver } from "./deliver.ts";
import type { EarnOutcome } from "./earn-handle.ts";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";
import { encodeEarnReport, encodeTickReport } from "./reports.ts";

/** Delivers what one move decided and returns the version the state reached with the notices to seal; a refused move still leaves a counted failure in the state. */
export function deliverEarn(runtime: TeeRuntime<Config>, input: { executor: Address; vault: Address; version: bigint; outcome: EarnOutcome; seal: (profile: Profile, version: bigint) => Hex }): { version: bigint; notices: Notice[] } {
  const { executor, vault, outcome, seal } = input;
  if (outcome.kind === "none") return { version: input.version, notices: [] };
  const next = input.version + 1n;
  if (outcome.kind === "held") {
    deliver(runtime, executor, encodeTickReport({ vault, next, ciphertext: seal(outcome.next, next) }));
    return { version: next, notices: outcome.notices };
  }
  try {
    deliver(runtime, executor, encodeEarnReport({ deposit: outcome.deposit, vault, asset: ASSET_ID.USDC, box: outcome.box, earnVault: outcome.earnVault, amount: outcome.amount, minOut: outcome.minOut, seen: outcome.seen, data: outcome.data, next, ciphertext: seal(outcome.next, next) }), outcome.gas.toString());
    return { version: next, notices: outcome.notices };
  } catch {
    // the vault refused the move, which leaves the state where it was: count the failure the way a refused bundle is counted
    deliver(runtime, executor, encodeTickReport({ vault, next, ciphertext: seal(outcome.failed.next, next) }));
    return { version: next, notices: outcome.failed.notices };
  }
}
