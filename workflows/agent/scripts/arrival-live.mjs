import { createPublicClient, http, pad } from "viem";

const RPC = "https://rpc.blockdaemon.testnet.arc.io";
const USDC = "0x3600000000000000000000000000000000000000";
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SPANS = [5_000n, 20_000n, 50_000n, 100_000n, 200_000n];

if (process.argv[2] !== "measure") {
  console.error("usage: node scripts/arrival-live.mjs measure");
  process.exit(1);
}

const client = createPublicClient({ transport: http(RPC) });
const head = await client.getBlockNumber();
let largest = 0n;
for (const span of SPANS) {
  const started = performance.now();
  try {
    const logs = await client.request({ method: "eth_getLogs", params: [{ address: USDC, topics: [TRANSFER, null, pad(VAULT)], fromBlock: `0x${(head - span).toString(16)}`, toBlock: `0x${head.toString(16)}` }] });
    console.log(`${span} blocks: ${logs.length} logs in ${Math.round(performance.now() - started)} ms`);
    largest = span;
  } catch (error) {
    console.log(`${span} blocks: refused (${String(error.shortMessage ?? error.message).slice(0, 80)}) after ${Math.round(performance.now() - started)} ms`);
    break;
  }
}
console.log(`largest span that returned: ${largest}; MAX_LOG_SPAN should be ${largest / 2n}`);
