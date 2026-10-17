import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http, pad } from "viem";

const RPC = "https://rpc.blockdaemon.testnet.arc.io";
const USDC = "0x3600000000000000000000000000000000000000";
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const out = new URL("../tests/fixtures/transfers/", import.meta.url);
mkdirSync(out, { recursive: true });
const client = createPublicClient({ transport: http(RPC) });
const head = await client.getBlockNumber();
let span = 200_000n;
let logs;
for (;;) {
  try {
    logs = await client.request({ method: "eth_getLogs", params: [{ address: USDC, topics: [TRANSFER, null, pad(VAULT)], fromBlock: `0x${(head - span).toString(16)}`, toBlock: `0x${head.toString(16)}` }] });
    break;
  } catch (error) {
    if (span <= 1_000n) throw error;
    span /= 2n;
  }
}
writeFileSync(new URL("usdc-transfers.json", out), `${JSON.stringify({ head: head.toString(), span: span.toString(), logs }, null, 2)}\n`);
const hash = logs.at(-1)?.transactionHash;
if (!hash) throw new Error("the vault received nothing in range; widen the range or use another vault");
const blockHex = logs.at(-1).blockNumber;
const both = await client.request({ method: "eth_getLogs", params: [{ topics: [TRANSFER, null, pad(VAULT)], fromBlock: blockHex, toBlock: blockHex }] });
writeFileSync(new URL("double-emitter.json", out), `${JSON.stringify({ txHash: hash, logs: both.filter((log) => log.transactionHash === hash) }, null, 2)}\n`);
