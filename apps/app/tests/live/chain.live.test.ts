import { BOX_KINDS } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { GET } from "../../src/app/api/logs/route.ts";
import { createLogsHandler } from "../../src/app/api/logs/handler.ts";
import { parseLogsResponse } from "../../src/chain/logs.ts";
import { paymentsFrom } from "../../src/chain/payments.ts";
import { readVault } from "../../src/chain/vault.ts";
import { agentDeploymentsFor, deploymentsFor } from "../../src/config/network.ts";

// The shared test vault; any vault created by the current factory works.
const VAULT = (process.env.E2E_VAULT ?? "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8") as `0x${string}`;
const keyed = Boolean(process.env.BLOCKSCOUT_API_KEY);

describe("reading a real vault on Arc testnet", () => {
  it("returns the six boxes, in order, with sane rules and amounts", async () => {
    const vault = await readVault(VAULT);
    expect(vault.boxes.map((box) => box.kind)).toEqual([...BOX_KINDS]);
    expect(vault.boxes.map((box) => box.id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const box of vault.boxes) {
      expect(box.usdc).toBeGreaterThanOrEqual(0n);
      expect(box.invested).toBeGreaterThanOrEqual(0n);
      expect(Number.isSafeInteger(box.rule.delaySeconds)).toBe(true);
    }
    expect(vault.agent).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(vault.now).toBeGreaterThan(1_700_000_000);
  });

  it.skipIf(!keyed)("serves the vault's real allocations through the route, and every payment adds up", async () => {
    const response = await GET(new Request(`http://app.test/api/logs?kind=allocated&vault=${VAULT}`, { headers: { "x-forwarded-for": "10.0.0.1" } }));
    expect(response.status).toBe(200);
    const { logs } = parseLogsResponse(await response.json());
    expect(logs.length).toBeGreaterThan(0);
    const payments = paymentsFrom(logs, []);
    expect(payments.length).toBeGreaterThan(0);
    for (const payment of payments) expect(Object.values(payment.byBox).reduce((sum, units) => sum + (units ?? 0n), 0n)).toBe(payment.total);
  });

  it("refuses an address that is not a vault of this factory, without asking the explorer", async () => {
    const response = await GET(new Request("http://app.test/api/logs?kind=allocated&vault=0x00000000000000000000000000000000000000a1", { headers: { "x-forwarded-for": "10.0.0.2" } }));
    expect(response.status).toBe(404);
  });

  it("answers unavailable, with no detail and no key, when the explorer cannot be reached", async () => {
    const handler = createLogsHandler({
      explorerApi: "http://127.0.0.1:1/api",
      apiKey: "SECRET-KEY-123",
      deployments: { ...deploymentsFor("testnet"), ...agentDeploymentsFor("testnet") },
      isVault: async () => true,
      headBlock: async () => 67_000_000,
      timeoutMs: 1_000,
    });
    const response = await handler(new Request(`http://app.test/api/logs?kind=notice&vault=${VAULT}`, { headers: { "x-forwarded-for": "10.0.0.3" } }));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(JSON.stringify({ error: "unavailable" }));
  });
});
