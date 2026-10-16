import { createLimiter } from "@strickle/db/limiter";
import { createTestDatabase } from "@strickle/db/testing";
import { migrate } from "@strickle/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DepositDeps, handleCreateDeposit, handleDepositUpdate } from "../../src/server/deposits.ts";

const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const SENDER = "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A";
const ORIGIN = { origin: "http://localhost:3200" };
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let deps: DepositDeps;

beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  deps = {
    env: { RELAY_IP_PEPPER: "p".repeat(32) },
    sql: db.sql,
    limiter: createLimiter(db.sql),
    network: "mainnet",
    guard: { vault: async () => ({ registered: true, hasState: true, paused: false }) },
    access: async () => "allow",
    burn: async () => ({ status: "pending_confirmations", forwardState: null, forwardTxHash: null, amount: 99_400_000n, feeExecuted: 0n, sourceDomain: 0, destinationDomain: 26, appliedSpeed: null }), // the transfer after a conversion burns what the swap delivered (swapOut below)
    burnSender: async () => SENDER,
    track: async () => ({ state: "waiting" }),
  };
});
afterAll(async () => db.drop());

const post = (path: string, body: unknown, ip: string) => new Request(`http://localhost:3200/api/deposits${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, ...ORIGIN }, body: JSON.stringify(body) });
const usdt = { vault: VAULT, sourceChain: "Ethereum", sourceAddress: SENDER, amount: "100000000", speed: "fast", feeMode: "destination", intent: "income", inputToken: "USDT" };

describe("USDT deposits through the routes", () => {
  it("creates one on a chain that lists USDT and refuses one that does not", async () => {
    expect((await handleCreateDeposit(post("", usdt, "10.1.0.1"), deps)).status).toBe(201);
    const noUsdt = await handleCreateDeposit(post("", { ...usdt, sourceChain: "Polygon_Amoy_Testnet" }, "10.1.0.2"), deps);
    expect(noUsdt.status).toBe(400);
  });

  it("refuses USDT on testnet, where no quote exists", async () => {
    const testnet = { ...deps, network: "testnet" as const };
    expect((await handleCreateDeposit(post("", { ...usdt, sourceChain: "Base_Sepolia" }, "10.1.0.3"), testnet)).status).toBe(400);
  });

  it("takes the conversion first, then the burn, and not the other way round", async () => {
    const created = (await handleCreateDeposit(post("", usdt, "10.1.0.4"), deps)).body;
    if (created.status !== "created") throw new Error("setup");
    const update = (body: unknown) => handleDepositUpdate(post(`/${created.id}`, body, "10.1.0.4"), created.id, deps);
    expect((await update({ burnTx: `0x${"b1".repeat(32)}` })).status).toBe(400); // not converted yet
    expect((await update({ swapTx: `0x${"a1".repeat(32)}`, swapOut: "99400000" })).status).toBe(200);
    expect((await update({ swapTx: `0x${"a1".repeat(32)}`, swapOut: "99400000" })).status).toBe(200); // same swap again
    expect((await update({ swapTx: `0x${"a2".repeat(32)}`, swapOut: "99400000" })).status).toBe(400); // another swap for the same deposit
    expect((await update({ burnTx: `0x${"b1".repeat(32)}` })).status).toBe(200);
  });

  it("refuses a swap record for a USDC deposit and malformed amounts", async () => {
    const usdc = (await handleCreateDeposit(post("", { ...usdt, inputToken: "USDC", feeMode: "source", sourceChain: "Base" }, "10.1.0.5"), deps)).body;
    if (usdc.status !== "created") throw new Error("setup");
    expect((await handleDepositUpdate(post(`/${usdc.id}`, { swapTx: `0x${"a3".repeat(32)}`, swapOut: "1" }, "10.1.0.5"), usdc.id, deps)).status).toBe(400);
    expect((await handleDepositUpdate(post(`/${usdc.id}`, { swapTx: `0x${"a3".repeat(32)}`, swapOut: "-1" }, "10.1.0.5"), usdc.id, deps)).status).toBe(400);
  });
});
