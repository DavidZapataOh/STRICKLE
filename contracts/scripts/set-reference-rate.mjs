import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { networks, rpcUrl } from "@strickle/arc/networks";

const SERIES = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";

/** One EURC is one euro: its price in dollars is the ECB euro reference rate, with eight decimals. */
export async function ecbEurcUsdE8(fetchImpl = fetch) {
  const response = await fetchImpl(SERIES);
  if (!response.ok) throw new Error(`the ECB series answered ${response.status}`);
  const body = await response.json();
  const usd = body.rates?.USD;
  if (typeof usd !== "number" || !(usd > 0.5 && usd < 2)) throw new Error("the ECB series returned an unusable rate");
  return BigInt(Math.round(usd * 1e8));
}

if (import.meta.main) {
  const mode = process.argv[2];
  const rate = await ecbEurcUsdE8();
  if (mode === "print") {
    console.log(`EURC_USD_E8=${rate}`);
  } else if (mode === "set") {
    const key = process.env.PRIVATE_KEY;
    if (!key) throw new Error("PRIVATE_KEY is not set");
    const manifest = JSON.parse(readFileSync(new URL("../deployments/arc-testnet.json", import.meta.url), "utf8"));
    const feed = manifest.contracts["ReferenceFeed#2"]?.address;
    if (!feed) throw new Error("the testnet manifest has no EURC reference feed");
    const chain = networks.testnet.chain;
    const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl("testnet")) });
    const hash = await wallet.writeContract({ address: feed, abi: parseAbi(["function set(int256)"]), functionName: "set", args: [rate] });
    await createPublicClient({ chain, transport: http(rpcUrl("testnet")) }).waitForTransactionReceipt({ hash });
    console.log(`EURC reference feed ${feed} set to ${rate} (tx ${hash})`);
  } else {
    console.error("usage: node scripts/set-reference-rate.mjs <print|set>");
    process.exit(1);
  }
}
