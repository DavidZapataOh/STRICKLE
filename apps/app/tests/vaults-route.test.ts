import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vaultsAnswer } from "../src/yield/handler.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/earn-vaults.json", import.meta.url), "utf8"));
const answering = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe("the list of vaults the app serves", () => {
  it("is Circle's live answer narrowed to the offered vaults, and cacheable", async () => {
    const answer = await vaultsAnswer("testnet", answering(fixture));
    expect(answer.cacheable).toBe(true);
    expect(answer.body.vaults).toHaveLength(1);
    expect(answer.body.vaults[0]).toMatchObject({ name: "EarnKit USDC Vault", protocol: "Morpho", apyBps: 420 });
  });

  it("asks Circle for the right chain", async () => {
    const urls: string[] = [];
    await vaultsAnswer("testnet", async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify(fixture));
    });
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0] ?? "").searchParams.get("chain")).toBe("ARC-TESTNET");
  });

  it("is an empty list, not an error, when Circle fails, answers badly or is unreachable", async () => {
    for (const fetchImpl of [answering({}, 500), answering("nope"), answering(null), async () => { throw new Error("offline"); }]) {
      const answer = await vaultsAnswer("testnet", fetchImpl);
      expect(answer).toEqual({ body: { vaults: [] }, cacheable: false });
    }
  });

  it("does not ask Circle at all where no vault is offered", async () => {
    let asked = false;
    const answer = await vaultsAnswer("mainnet", async () => {
      asked = true;
      return new Response("{}");
    });
    expect(asked).toBe(false);
    expect(answer).toEqual({ body: { vaults: [] }, cacheable: true });
  });
});
