import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { SwapKit } from "@circle-fin/swap-kit";
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

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

const AMOUNT = 5_000_000n;
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// A real USDC to EURC swap of 5 USDC on Arc testnet through the kit, from an externally owned account, with the stop limit at the amount itself (the kit takes it as a decimal string, not in base units).
async function swap() {
  const raw = process.env.PRIVATE_KEY;
  if (!raw) throw new Error("PRIVATE_KEY is not set");
  const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
  const testnet = createPublicClient({ transport: http(TESTNET_RPC) });
  const owner = privateKeyToAccount(privateKey).address;
  const balance = (token) => testnet.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] });
  const [usdcBefore, eurcBefore] = await Promise.all([balance(USDC), balance(EURC)]);
  console.log(`spike account ${owner}: ${formatUnits(usdcBefore, 6)} USDC, ${formatUnits(eurcBefore, 6)} EURC`);
  if (usdcBefore < AMOUNT + 1_000_000n) throw new Error("the account holds too little USDC for a 5 USDC swap and its gas");
  const adapter = createViemAdapterFromPrivateKey({ privateKey, getPublicClient: ({ chain }) => createPublicClient({ chain, transport: http(TESTNET_RPC) }), getWalletClient: ({ chain, account }) => createWalletClient({ chain, account, transport: http(TESTNET_RPC) }) });
  const result = await new SwapKit().swap({
    from: { adapter, chain: "Arc_Testnet" },
    tokenIn: USDC,
    tokenOut: EURC,
    amountIn: "5.0",
    config: { stopLimit: "5.0", allowanceStrategy: "approve" },
  });
  const receipt = await testnet.waitForTransactionReceipt({ hash: result.txHash });
  const [usdcAfter, eurcAfter] = await Promise.all([balance(USDC), balance(EURC)]);
  const received = eurcAfter - eurcBefore;
  console.log(`swap ${result.txHash} (${receipt.status}): spent ${formatUnits(usdcBefore - usdcAfter, 6)} USDC, received ${formatUnits(received, 6)} EURC, effective rate ${Number(received) / Number(usdcBefore - usdcAfter)} EURC per USDC`);
}

const mode = process.argv[2];
if (mode === "c") await feeds();
else if (mode === "a") await swap();
else {
  console.error("usage: node scripts/swap-spike.mjs <a|c>");
  process.exit(1);
}
