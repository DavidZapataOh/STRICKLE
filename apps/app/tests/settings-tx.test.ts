import { describe, expect, it } from "vitest";
import { type TxDeps, type TxPhase, runTx } from "../src/settings/tx.ts";

function harness(overrides: Partial<TxDeps> = {}, answers: boolean[] = [true]) {
  let clock = 0;
  const phases: TxPhase[] = [];
  const deps: TxDeps = {
    send: async () => "0x01",
    confirmed: async () => answers.shift() ?? false,
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
    isCancelled: (error) => error instanceof Error && error.message === "cancelled",
    ...overrides,
  };
  return { run: (options?: { windowMs?: number; pollMs?: number }) => runTx(deps, (phase) => phases.push(phase), options), phases };
}

describe("runTx", () => {
  it("signs, waits for the chain and finishes done", async () => {
    const { run, phases } = harness();
    expect(await run()).toBe("done");
    expect(phases).toEqual(["signing", "confirming", "done"]);
  });

  it("keeps asking the chain until it agrees", async () => {
    const { run } = harness({}, [false, false, true]);
    expect(await run()).toBe("done");
  });

  it("tells a cancelled passkey prompt from a failure and sends nothing more", async () => {
    expect(await harness({ send: async () => { throw new Error("cancelled"); } }).run()).toBe("cancelled");
    expect(await harness({ send: async () => { throw new Error("boom"); } }).run()).toBe("failed");
  });

  it("says unconfirmed, not failed, when the transaction went out but the chain never agreed in the window", async () => {
    const { run, phases } = harness({}, []);
    expect(await run({ windowMs: 10_000, pollMs: 2_000 })).toBe("unconfirmed");
    expect(phases.at(-1)).toBe("unconfirmed");
  });

  it("survives a read that fails while it waits", async () => {
    let calls = 0;
    const { run } = harness({ confirmed: async () => { calls += 1; if (calls === 1) throw new Error("rpc"); return true; } });
    expect(await run()).toBe("done");
  });
});
