import { createPublicClient, formatUnits, http, parseAbi } from "viem";

const feedAbi = parseAbi(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)", "function decimals() view returns (uint8)"]);
const FEEDS = {
  "USDC/USD": "0x84EA90AC252Dc437031461836DB5164219147905",
  "EURC/USD": "0x361b95c10b76Ca3f35C686d423e43A951755Bf23",
};
const MAINNET_RPC = "https://rpc.blockdaemon.mainnet.arc.io";
const TESTNET_RPC = "https://rpc.blockdaemon.testnet.arc.io";

async function feeds() {
  const mainnet = createPublicClient({ transport: http(MAINNET_RPC) });
  const now = Math.floor(Date.now() / 1000);
  for (const [name, address] of Object.entries(FEEDS)) {
    const [round, decimals] = await Promise.all([mainnet.readContract({ address, abi: feedAbi, functionName: "latestRoundData" }), mainnet.readContract({ address, abi: feedAbi, functionName: "decimals" })]);
    console.log(`mainnet ${name} ${address}: answer ${formatUnits(round[1], decimals)} (${decimals} decimals), updatedAt ${round[3]}, age ${now - Number(round[3])} s`);
  }
  const directory = await fetch("https://reference-data-directory.vercel.app/feeds-arc-testnet.json");
  console.log("testnet feed directory:", directory.status);
  const testnet = createPublicClient({ transport: http(TESTNET_RPC) });
  for (const [name, address] of Object.entries(FEEDS)) {
    const code = await testnet.getCode({ address });
    console.log(`testnet code at the mainnet proxy of ${name}: ${code && code !== "0x" ? "present" : "none"}`);
  }
}

const mode = process.argv[2];
if (mode === "c") await feeds();
else {
  console.error("usage: node scripts/swap-spike.mjs c");
  process.exit(1);
}
