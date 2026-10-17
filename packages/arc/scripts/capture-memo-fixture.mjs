import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http } from "viem";

const TX = "0xfbe239f1910a1d183c11bea323ea0389f98cac3f1a1010ff5786276cad7498cc";
const out = new URL("../tests/fixtures/memo/", import.meta.url);
mkdirSync(out, { recursive: true });
const client = createPublicClient({ transport: http("https://rpc.blockdaemon.testnet.arc.io") });
const [receipt, tx] = await Promise.all([client.getTransactionReceipt({ hash: TX }), client.getTransaction({ hash: TX })]);
const logs = receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data, logIndex: log.logIndex }));
writeFileSync(new URL("payment.json", out), `${JSON.stringify({ hash: TX, from: receipt.from, to: receipt.to, status: receipt.status, logs }, null, 2)}\n`);
writeFileSync(new URL("input.json", out), `${JSON.stringify({ input: tx.input }, null, 2)}\n`);
