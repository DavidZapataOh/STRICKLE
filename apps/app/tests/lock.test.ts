import { describe, expect, it } from "vitest";
import { withProposalLock } from "../src/agent/lock.ts";

// A lock manager with the Web Locks contract that matters here: ifAvailable gives the callback null while the lock is held elsewhere.
function fakeLocks() {
  const held = new Set<string>();
  return {
    request: async (name: string, options: { ifAvailable: boolean }, callback: (lock: object | null) => Promise<unknown>) => {
      if (held.has(name) && options.ifAvailable) return callback(null);
      held.add(name);
      try {
        return await callback({});
      } finally {
        held.delete(name);
      }
    },
  } as unknown as Pick<LockManager, "request">;
}

describe("withProposalLock", () => {
  it("runs the work and returns its value", async () => {
    expect(await withProposalLock("p-1", async () => 7, fakeLocks())).toEqual({ ran: true, value: 7 });
  });

  it("refuses a second decision on the same proposal while the first is in flight, and allows another proposal", async () => {
    const locks = fakeLocks();
    let release: () => void = () => undefined;
    const first = withProposalLock("p-1", () => new Promise<string>((resolve) => (release = () => resolve("done"))), locks);
    await Promise.resolve();
    expect(await withProposalLock("p-1", async () => "second", locks)).toEqual({ ran: false });
    expect(await withProposalLock("p-2", async () => "other", locks)).toEqual({ ran: true, value: "other" });
    release();
    expect(await first).toEqual({ ran: true, value: "done" });
    expect(await withProposalLock("p-1", async () => "again", locks)).toEqual({ ran: true, value: "again" });
  });

  it("still runs the work when the browser has no Web Locks", async () => {
    expect(await withProposalLock("p-1", async () => "ok", undefined)).toEqual({ ran: true, value: "ok" });
  });

  it("releases the lock when the work throws", async () => {
    const locks = fakeLocks();
    await expect(withProposalLock("p-1", async () => { throw new Error("boom"); }, locks)).rejects.toThrow("boom");
    expect(await withProposalLock("p-1", async () => "after", locks)).toEqual({ ran: true, value: "after" });
  });
});
