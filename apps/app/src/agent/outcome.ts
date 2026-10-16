import type { Address, Hex } from "viem";
import type { RelayResult } from "../server/relay-types.ts";

export type Phase = "idle" | "signing" | "sending" | "busy" | "waiting" | "confirmed" | "unconfirmed" | "failed" | "cancelled";
export type FailReason = "signing" | "refused" | "paused" | "unknown-vault" | "closed" | "busy-too-long" | "misconfigured";
export interface Outcome {
  phase: "confirmed" | "unconfirmed" | "failed" | "cancelled";
  reason?: FailReason;
}

export interface SendDeps {
  sign(): Promise<{ vault: Address; sealed: Hex }>;
  post(envelope: { vault: Address; sealed: Hex }): Promise<RelayResult>;
  confirmed(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
  random(): number;
  isCancelled(error: unknown): boolean;
}

// The request is signed with a deadline of 540 seconds: after that the enclave would refuse it anyway.
const REQUEST_WINDOW_MS = 500_000;
const CONFIRM_WINDOW_MS = 180_000;
const DEFINITIVE: Partial<Record<RelayResult["status"], FailReason>> = { rejected: "refused", paused: "paused", "unknown-vault": "unknown-vault", closed: "closed", misconfigured: "misconfigured" };

export async function runSend(deps: SendDeps, onPhase: (phase: Phase) => void, options: { requestWindowMs?: number; confirmWindowMs?: number } = {}): Promise<Outcome> {
  const finish = (outcome: Outcome): Outcome => {
    onPhase(outcome.phase);
    return outcome;
  };

  onPhase("signing");
  let envelope: { vault: Address; sealed: Hex };
  try {
    envelope = await deps.sign();
  } catch (error) {
    return finish(deps.isCancelled(error) ? { phase: "cancelled" } : { phase: "failed", reason: "signing" });
  }

  const startedAt = deps.now();
  onPhase("sending");
  for (;;) {
    let result: RelayResult | undefined;
    try {
      result = await deps.post(envelope);
    } catch {
      // the request may or may not have left the browser: never claim it was not sent, keep looking for the decision
      result = undefined;
    }
    if (result === undefined || result.status === "unavailable" || result.status === "accepted") break;
    const definitive = DEFINITIVE[result.status];
    if (definitive) return finish({ phase: "failed", reason: definitive });
    // busy or rate-limited: wait the hinted time plus up to two seconds of jitter, so waiting tabs and users do not all return together
    const wait = (result.retryAfterSeconds ?? 30) * 1000 + Math.floor(deps.random() * 2_000) + 1;
    if (deps.now() + wait - startedAt > (options.requestWindowMs ?? REQUEST_WINDOW_MS)) return finish({ phase: "failed", reason: "busy-too-long" });
    onPhase("busy");
    await deps.sleep(wait);
  }

  onPhase("waiting");
  const confirmStart = deps.now();
  const window = options.confirmWindowMs ?? CONFIRM_WINDOW_MS;
  for (;;) {
    try {
      if (await deps.confirmed()) return finish({ phase: "confirmed" });
    } catch {
      // a failed read says nothing about the action: keep waiting
    }
    const elapsed = deps.now() - confirmStart;
    if (elapsed >= window) return finish({ phase: "unconfirmed" });
    await deps.sleep(elapsed < 30_000 ? 3_000 : 6_000);
  }
}
