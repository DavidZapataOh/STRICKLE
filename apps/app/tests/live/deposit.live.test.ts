import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createDepositKit, creditedLog, executeDeposit, quoteDeposit, sourceChain, trackDeposit } from "@strickle/arc/bridge";
import { networks } from "@strickle/arc/networks";
import { createLimiter } from "@strickle/db/limiter";
import { createTestDatabase } from "@strickle/db/testing";
import { migrate } from "@strickle/db";
import { createPublicClient, http, parseAbiItem, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentDeploymentsFor } from "../../src/config/network.ts";
import { type DepositDeps, handleCreateDeposit, handleDepositRead, handleDepositUpdate } from "../../src/server/deposits.ts";
import { fetchBurnMessage } from "@strickle/arc/bridge";

const key = process.env.DEPOSIT_TEST_KEY as `0x${string}` | undefined;
const VAULT = (process.env.E2E_VAULT ?? "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8") as `0x${string}`;
const arc = createPublicClient({ chain: networks.testnet.chain, transport: http(networks.testnet.rpcUrl) }) as PublicClient;
const source = sourceChain("testnet", "Avalanche_Fuji");
const ORIGIN = "http://localhost:3200";
const split = parseAbiItem("event Split(address indexed vault, uint8 indexed asset, uint256 amount)");
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!key || !process.env.DATABASE_URL)("a real deposit from another chain, through the real handlers (needs DEPOSIT_TEST_KEY and DATABASE_URL)", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeAll(async () => {
    db = await createTestDatabase();
    await migrate(db.sql);
  });
  afterAll(() => db.drop());

  it("quotes, burns on Avalanche Fuji, is recorded, arrives in the vault and is split by the agent", async () => {
    const account = privateKeyToAccount(key as `0x${string}`);
    const adapter = await createViemAdapterFromPrivateKey({ privateKey: key as `0x${string}` });
    const sourceClient = createPublicClient({ transport: http(source.rpc[0]) });
    const deps: DepositDeps = {
      env: { RELAY_IP_PEPPER: "p".repeat(32) },
      sql: db.sql,
      limiter: createLimiter(db.sql),
      network: "testnet",
      guard: { vault: async () => ({ registered: true }) },
      access: async () => "allow",
      burn: (domain, tx) => fetchBurnMessage("testnet", domain, tx),
      burnSender: async (_chainId, tx) => (await sourceClient.getTransaction({ hash: tx })).from,
      track: (input) => trackDeposit({ ...input, client: arc }),
    };
    const quote = await quoteDeposit({ kit: createDepositKit(), adapter }, { network: "testnet", source, sourceAddress: account.address, vault: VAULT, amountSent: 1_000_000n, speed: "fast", feePayment: "destination" });
    const post = (path: string, body: unknown) => new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });

    const created = (await handleCreateDeposit(post("/api/deposits", { vault: VAULT, sourceChain: source.id, sourceAddress: account.address, amount: quote.amountSent.toString(), speed: "fast", feeMode: "destination", intent: "income" }), deps)).body;
    if (created.status !== "created") throw new Error(`not created: ${created.status}`);

    const { burnTx } = await executeDeposit({ kit: createDepositKit(), adapter }, quote, () => {});
    let registered = await handleDepositUpdate(post(`/api/deposits/${created.id}`, { burnTx }), created.id, deps);
    for (let i = 0; i < 60 && registered.body.status === "rejected" && registered.body.retryAfterSeconds; i++) {
      await sleep(registered.body.retryAfterSeconds * 1000);
      registered = await handleDepositUpdate(post(`/api/deposits/${created.id}`, { burnTx }), created.id, deps);
    }
    expect(registered.body.status).toBe("ok");

    let read = await handleDepositRead(new Request(`${ORIGIN}/api/deposits/${created.id}`), created.id, deps);
    for (let i = 0; i < 90 && !(read.body.status === "ok" && read.body.deposit.state === "arrived"); i++) {
      await sleep(10_000);
      read = await handleDepositRead(new Request(`${ORIGIN}/api/deposits/${created.id}`), created.id, deps);
    }
    if (read.body.status !== "ok" || read.body.deposit.state !== "arrived" || !read.body.deposit.forwardTx || !read.body.deposit.received) throw new Error("the deposit did not arrive");
    const received = BigInt(read.body.deposit.received);
    expect(received).toBeGreaterThanOrEqual(quote.amountReceivedMin);

    const receipt = await arc.getTransactionReceipt({ hash: read.body.deposit.forwardTx as `0x${string}` });
    const credits = creditedLog(receipt, networks.testnet.usdc, VAULT);
    expect(credits.reduce((sum, credit) => sum + credit.amount, 0n)).toBe(received);

    // the shared vault also receives other tests' deposits: look for a split at least as large as this credit, not for an exact balance
    const executor = agentDeploymentsFor("testnet").AgentExecutor;
    let seen = 0n;
    for (let i = 0; i < 18 && seen < received; i++) {
      const logs = await arc.getLogs({ address: executor, event: split, args: { vault: VAULT }, fromBlock: receipt.blockNumber });
      seen = logs.reduce((max, log) => (log.args.amount !== undefined && log.args.amount > max ? log.args.amount : max), 0n);
      if (seen < received) await sleep(10_000);
    }
    expect(seen).toBeGreaterThanOrEqual(received);
    console.info("deposit evidence", JSON.stringify({ burnTx, forwardTx: read.body.deposit.forwardTx, received: received.toString() }));
  });
});
