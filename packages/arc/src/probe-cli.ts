import { probeNetwork } from "./probe.ts";

const name = process.argv[2];
if (name !== "testnet" && name !== "mainnet") {
  console.error("usage: npm run probe -w @strickle/arc -- <testnet|mainnet>");
  process.exit(1);
}
const probe = await probeNetwork(name);
console.log(`${probe.network}: chain ${probe.chainId}, block ${probe.blockNumber}, USDC code ${probe.usdcCodeBytes} bytes, EURC code ${probe.eurcCodeBytes} bytes`);
