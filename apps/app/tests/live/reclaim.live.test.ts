import { describe, expect, it } from "vitest";
import { checkProof, isPlatform, startRequest } from "../../src/server/reclaim.ts";

const keyed = Boolean(process.env.RECLAIM_APP_ID && process.env.RECLAIM_APP_SECRET);

describe("Reclaim proof requests (live)", () => {
  it("knows the two platforms and nothing else", () => {
    expect(isPlatform("upwork") && isPlatform("fiverr")).toBe(true);
    expect([isPlatform("paypal"), isPlatform("__proto__"), isPlatform(undefined)]).toEqual([false, false, false]);
  });

  it.skipIf(!keyed)("opens a real proof request for each platform", async () => {
    for (const platform of ["upwork", "fiverr"] as const) {
      const started = await startRequest(platform);
      expect(started.requestUrl).toMatch(/^https:\/\//);
      expect(started.statusUrl).toMatch(/^https:\/\//);
    }
  }, 60_000);

  it.skipIf(!keyed)("refuses a proof nobody signed", async () => {
    const forged = { identifier: "0x", claimData: { provider: "http", parameters: "{}", owner: "0x0", timestampS: 1, context: "{}", identifier: "0x", epoch: 1 }, signatures: [], witnesses: [] };
    expect(await checkProof("upwork", forged as never).catch(() => ({ ok: false }))).toMatchObject({ ok: false });
  }, 60_000);
});
