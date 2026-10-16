import type { Hex } from "viem";

export type TxPhase = "idle" | "signing" | "confirming" | "done" | "unconfirmed" | "failed" | "cancelled";

export interface TxDeps {
  send(): Promise<Hex>;
  confirmed(): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
  isCancelled(error: unknown): boolean;
}

/** Sends one owner transaction, then waits until the chain shows its effect: the screen reports facts, not hopes. */
export async function runTx(deps: TxDeps, onPhase: (phase: TxPhase) => void, options: { windowMs?: number; pollMs?: number } = {}): Promise<TxPhase> {
  const windowMs = options.windowMs ?? 90_000;
  const pollMs = options.pollMs ?? 2_000;
  const finish = (phase: TxPhase): TxPhase => {
    onPhase(phase);
    return phase;
  };
  onPhase("signing");
  try {
    await deps.send();
  } catch (error) {
    return finish(deps.isCancelled(error) ? "cancelled" : "failed");
  }
  onPhase("confirming");
  const deadline = deps.now() + windowMs;
  while (deps.now() <= deadline) {
    try {
      if (await deps.confirmed()) return finish("done");
    } catch {
      // a failed read is asked again until the window ends
    }
    await deps.sleep(pollMs);
  }
  return finish("unconfirmed");
}
