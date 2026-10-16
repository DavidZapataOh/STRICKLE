import { describe, expect, it } from "vitest";
import { sendWithFallback } from "../src/settings/send.ts";

// The paymaster cannot be made to refuse on demand, so the fallback decision is tested with a recording wallet; the unsponsored path itself is exercised by the arc live passkey test.
const calls = [{ to: "0x00000000000000000000000000000000000000b2", data: "0x" }] as const;
const wallet = (fail: Error | null) => {
  const seen: (boolean | undefined)[] = [];
  return { seen, sendCalls: async (_: typeof calls, options?: { sponsored?: boolean }) => { seen.push(options?.sponsored); if (fail && seen.length === 1) throw fail; return "0xabc" as const; } };
};

describe("sendWithFallback", () => {
  it("sends once, sponsored, when the paymaster answers", async () => {
    const w = wallet(null);
    expect(await sendWithFallback(w, calls, () => false)).toBe("0xabc");
    expect(w.seen).toEqual([undefined]);
  });

  it("retries once, unsponsored, when the failure is a sponsorship one", async () => {
    const w = wallet(new Error("paymaster quota"));
    expect(await sendWithFallback(w, calls, () => true)).toBe("0xabc");
    expect(w.seen).toEqual([undefined, false]);
  });

  it("does not retry any other failure, so a cancelled prompt is never asked twice", async () => {
    const w = wallet(new Error("cancelled"));
    await expect(sendWithFallback(w, calls, () => false)).rejects.toThrow("cancelled");
    expect(w.seen).toEqual([undefined]);
  });
});
