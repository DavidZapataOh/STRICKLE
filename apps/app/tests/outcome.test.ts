import { describe, expect, it } from "vitest";
import { type Phase, type SendDeps, runSend } from "../src/agent/outcome.ts";

const envelope = { vault: "0x00000000000000000000000000000000000000a1", sealed: "0xab" } as const;

function harness(overrides: Partial<SendDeps> = {}) {
  let clock = 0;
  const phases: Phase[] = [];
  const waits: number[] = [];
  const deps: SendDeps = {
    sign: async () => envelope,
    post: async () => ({ status: "accepted" }),
    confirmed: async () => true,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
    random: () => 0,
    isCancelled: (error) => (error as Error).message === "cancelled",
    ...overrides,
  };
  return { deps, phases, waits, run: (options?: Parameters<typeof runSend>[2]) => runSend(deps, (phase) => phases.push(phase), options) };
}

describe("runSend", () => {
  it("walks signing, sending, waiting and ends confirmed when the chain says so", async () => {
    const h = harness();
    expect(await h.run()).toEqual({ phase: "confirmed" });
    expect(h.phases).toEqual(["signing", "sending", "waiting", "confirmed"]);
  });

  it("ends cancelled when the user dismisses the passkey and sends nothing", async () => {
    let posted = 0;
    const h = harness({ sign: async () => { throw new Error("cancelled"); }, post: async () => { posted += 1; return { status: "accepted" }; } });
    expect(await h.run()).toEqual({ phase: "cancelled" });
    expect(posted).toBe(0);
  });

  it("ends failed with the signing reason when signing breaks for another reason, having sent nothing", async () => {
    let posted = 0;
    const h = harness({ sign: async () => { throw new Error("boom"); }, post: async () => { posted += 1; return { status: "accepted" }; } });
    expect(await h.run()).toEqual({ phase: "failed", reason: "signing" });
    expect(posted).toBe(0);
  });

  it("retries a busy relay after its hinted wait plus a little jitter, inside the request window", async () => {
    let calls = 0;
    const h = harness({ random: () => 0.5, post: async () => (++calls < 3 ? { status: "busy", retryAfterSeconds: 30 } : { status: "accepted" }) });
    expect((await h.run()).phase).toBe("confirmed");
    expect(h.phases).toContain("busy");
    expect(h.waits.filter((ms) => ms > 30_000 && ms <= 33_000)).toHaveLength(2);
  });

  it("treats the per-address limit like a busy relay", async () => {
    let calls = 0;
    const h = harness({ post: async () => (++calls < 2 ? { status: "rate-limited", retryAfterSeconds: 20 } : { status: "accepted" }) });
    expect((await h.run()).phase).toBe("confirmed");
  });

  it("gives up with busy-too-long when the relay stays busy past the request's own deadline", async () => {
    const h = harness({ post: async () => ({ status: "busy", retryAfterSeconds: 30 }) });
    expect(await h.run({ requestWindowMs: 100_000 })).toEqual({ phase: "failed", reason: "busy-too-long" });
  });

  it("does not retry a definitive refusal and names its reason", async () => {
    const reasons = { rejected: "refused", paused: "paused", "unknown-vault": "unknown-vault", closed: "closed", misconfigured: "misconfigured" } as const;
    for (const [status, reason] of Object.entries(reasons)) {
      let calls = 0;
      const h = harness({ post: async () => { calls += 1; return { status } as never; } });
      expect(await h.run()).toEqual({ phase: "failed", reason });
      expect(calls).toBe(1);
    }
  });

  it("does not say nothing was sent when the relay is unreachable or the request errored: it keeps looking for the decision", async () => {
    for (const post of [async () => ({ status: "unavailable" as const }), async () => { throw new Error("network"); }]) {
      let polls = 0;
      const h = harness({ post, confirmed: async () => ++polls >= 2 });
      expect(await h.run()).toEqual({ phase: "confirmed" });
      expect(h.phases).toContain("waiting");
    }
    const lost = harness({ post: async () => { throw new Error("network"); }, confirmed: async () => false });
    expect(await lost.run({ confirmWindowMs: 30_000 })).toEqual({ phase: "unconfirmed" });
  });

  it("polls quickly at first, then slower, and ends unconfirmed without claiming success", async () => {
    const h = harness({ confirmed: async () => false });
    expect(await h.run({ confirmWindowMs: 60_000 })).toEqual({ phase: "unconfirmed" });
    expect(h.waits.slice(0, 3)).toEqual([3_000, 3_000, 3_000]);
    expect(Math.max(...h.waits)).toBe(6_000);
    expect(h.waits.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(60_000);
  });

  it("treats a read error while waiting as not yet confirmed, not as a failure of the send", async () => {
    let calls = 0;
    const h = harness({ confirmed: async () => { if (++calls < 3) throw new Error("rpc down"); return true; } });
    expect((await h.run()).phase).toBe("confirmed");
  });
});
