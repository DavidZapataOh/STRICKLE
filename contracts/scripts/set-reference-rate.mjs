import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { networks, rpcUrl } from "@strickle/arc/networks";

const SERIES = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";

/** One EURC is one euro: its price in dollars is the ECB euro reference rate, with eight decimals. */
export async function ecbEurcUsdE8(fetchImpl = fetch) {
  const response = await fetchImpl(SERIES, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`the ECB series answered ${response.status}`);
  const body = await response.json();
  const usd = body.rates?.USD;
  if (typeof usd !== "number" || !(usd > 0.5 && usd < 2)) throw new Error("the ECB series returned an unusable rate");
  return BigInt(Math.round(usd * 1e8));
}

/** Keeps a stale shell variable or a typo from reaching the feed: the euro has not been outside this range in its history. */
export function checkedRate(value) {
  const rate = BigInt(value);
  if (rate < 50_000_000n || rate > 200_000_000n) throw new Error(`EURC_USD_E8 ${rate} is outside 0.5 to 2.0 dollars`);
  return rate;
}

if (import.meta.main) {
  const mode = process.argv[2];
  const rate = checkedRate(await ecbEurcUsdE8());
  if (mode === "print") {
    console.log(`EURC_USD_E8=${rate}`);
  } else if (mode === "set") {
    const key = process.env.PRIVATE_KEY;
    if (!key) throw new Error("PRIVATE_KEY is not set");
    const manifest = JSON.parse(readFileSync(new URL("../deployments/arc-testnet.json", import.meta.url), "utf8"));
    // DeployVault creates the USDC feed first and the EURC feed second; both are refreshed because each goes stale on its own
    const feeds = [
      ["USDC", manifest.contracts.ReferenceFeed?.address, 100_000_000n],
      ["EURC", manifest.contracts["ReferenceFeed#2"]?.address, rate],
    ];
    if (feeds.some(([, address]) => !address)) throw new Error("the testnet manifest has no reference feeds");
    const chain = networks.testnet.chain;
    const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
    const wallet = createWalletClient({ account, chain, transport: http(rpcUrl("testnet")) });
    const client = createPublicClient({ chain, transport: http(rpcUrl("testnet")) });
    for (const [name, address, value] of feeds) {
      const hash = await wallet.writeContract({ address, abi: parseAbi(["function set(int256)"]), functionName: "set", args: [value] });
      await client.waitForTransactionReceipt({ hash });
      console.log(`${name} reference feed ${address} set to ${value} (tx ${hash})`);
    }
  } else {
    console.error("usage: node scripts/set-reference-rate.mjs <print|set>");
    process.exit(1);
  }
}
