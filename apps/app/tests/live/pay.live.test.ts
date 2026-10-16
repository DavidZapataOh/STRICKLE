import { encodeMemoPayment, readMemoPayments } from "@strickle/arc/memo";
import { networks } from "@strickle/arc/networks";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createLimiter } from "@strickle/db/limiter";
import { createInvoice, getLinkByToken } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { randomBytes } from "node:crypto";
import { createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentDeploymentsFor } from "../../src/config/network.ts";
import { chainReader } from "../../src/server/payment-deps.ts";
import { type PayDeps, handlePayClaim } from "../../src/server/pay.ts";
import { scanVault } from "../../src/server/reconcile.ts";

const key = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const VAULT = (process.env.E2E_VAULT ?? "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8") as `0x${string}`;
const network = networks.testnet;
const split = parseAbiItem("event Split(address indexed vault, uint8 indexed asset, uint256 amount)");
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Spends the shared deployer key (0.05 USDC to the shared test vault and a little gas): it runs only with RUN_PAY_LIVE=1, on the owner's go-ahead.
describe.skipIf(!key || !process.env.DATABASE_URL || process.env.RUN_PAY_LIVE !== "1")("a real Memo payment of an invoice (needs RUN_PAY_LIVE=1, PRIVATE_KEY and DATABASE_URL)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeAll(async () => {
    db = await createTestDatabase();
    await migrate(db.sql);
  });
  afterAll(() => db.drop());

  it("is credited from the reported transaction, once, and the agent splits it", async () => {
    const keys = invoiceKeys(randomBytes(32).toString("base64"));
    const client = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
    const deps: PayDeps = { env: { RELAY_IP_PEPPER: "p".repeat(32) }, sql: db.sql, keys, limiter: createLimiter(db.sql), chain: chainReader(client as never, network.usdc), network: "testnet", chainId: network.chain.id, usdc: network.usdc };
    const invoice = await createInvoice(db.sql, keys, { vault: VAULT, label: "Live", payeeName: "Live", note: "", amount: 50_000n, expiresAt: null });
    const link = await getLinkByToken(db.sql, keys, invoice.token);
    if (!link) throw new Error("no link");

    const account = privateKeyToAccount(key as `0x${string}`);
    const wallet = createWalletClient({ account, chain: network.chain, transport: http(network.rpcUrl) });
    const call = encodeMemoPayment({ token: network.usdc, vault: VAULT, amount: 50_000n, memoId: link.memoId });
    const hash = await wallet.sendTransaction({ to: call.to, data: call.data });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(readMemoPayments(receipt, network.usdc)).toEqual([expect.objectContaining({ amount: 50_000n, memoId: link.memoId })]);

    const claim = (ip: string) => handlePayClaim(new Request("http://localhost:3200/api/pay/x/claim", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3200", "x-forwarded-for": ip }, body: JSON.stringify({ txHash: hash }) }), invoice.token, deps);
    expect((await claim("10.0.0.1")).body).toEqual({ status: "claimed", result: "credited" });
    expect((await claim("10.0.0.2")).body).toEqual({ status: "claimed", result: "duplicate" });
    expect((await getLinkByToken(db.sql, keys, invoice.token))?.status).toBe("paid");

    // the scan over the same blocks credits nothing twice
    const reader = chainReader(client as never, network.usdc);
    const out = await scanVault({ sql: db.sql, keys, chain: reader, chainId: network.chain.id, usdc: network.usdc, maxBlocks: 50n }, VAULT);
    expect((await getLinkByToken(db.sql, keys, invoice.token))?.paid).toBe(50_000n);
    expect(out.credited).toBeGreaterThanOrEqual(0);

    // how large a window Arc's RPC serves: the figure payment-deps.ts uses
    const head = await client.getBlockNumber();
    for (const window of [5_000n, 50_000n]) {
      const logs = await client.getLogs({ address: network.usdc, event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"), args: { to: VAULT }, fromBlock: head - window, toBlock: head }).then(() => "ok", (error: Error) => error.message.slice(0, 80));
      console.error("getLogs window", window.toString(), logs);
    }

    const executor = agentDeploymentsFor("testnet").AgentExecutor;
    let seen = 0n;
    for (let i = 0; i < 18 && seen < 50_000n; i++) {
      const logs = await client.getLogs({ address: executor, event: split, args: { vault: VAULT }, fromBlock: receipt.blockNumber });
      seen = logs.reduce((max, log) => (log.args.amount !== undefined && log.args.amount > max ? log.args.amount : max), 0n);
      if (seen < 50_000n) await sleep(10_000);
    }
    expect(seen).toBeGreaterThanOrEqual(50_000n);
  }, 400_000);
});
