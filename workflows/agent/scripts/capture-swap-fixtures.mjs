import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { toFunctionSelector } from "viem";

const BASE = "https://api.circle.com/v1/stablecoinKits";
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const AMOUNT = "1000000";
const ADAPTER = "0xb4d0aA6Ca5e12B8a77b86989305A7F15462Ac2D4";
const NETWORKS = {
  testnet: { chain: "Arc_Testnet", usdc: "0x3600000000000000000000000000000000000000", eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" },
  mainnet: { chain: "Arc", usdc: "0x3600000000000000000000000000000000000000", eurc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" },
};
const out = new URL("../tests/fixtures/swap/", import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, value) => writeFileSync(new URL(name, out), `${JSON.stringify(value, null, 2)}\n`);

const fetchJson = async (url, init) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${JSON.stringify(body)}`);
  return body;
};

for (const [name, net] of Object.entries(NETWORKS)) {
  const common = { tokenInAddress: net.usdc, tokenInChain: net.chain, tokenOutAddress: net.eurc, amount: AMOUNT };
  const quote = await fetchJson(`${BASE}/quote?${new URLSearchParams({ ...common, fromAddress: VAULT, toAddress: VAULT, slippageBps: "100" })}`);
  write(`quote-${name}.json`, quote);
  const estimated = BigInt(quote.quote.estimatedAmount);
  // testnet pays more than reference, so the stop limit is the amount itself; mainnet asks for 98% of what the quote implies
  const stopLimit = name === "testnet" ? AMOUNT : ((estimated * 98n) / 100n).toString();
  if (name === "testnet" && estimated <= BigInt(AMOUNT)) throw new Error("the testnet pool no longer pays above reference; revisit the sandbox switch");
  const swap = await fetchJson(`${BASE}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...common, fromAddress: VAULT, toAddress: VAULT, stopLimit, provider: "lifi" }),
  });
  write(`swap-${name}.json`, swap);
  const beneficiaries = swap.transaction.executionParams.tokens.map((entry) => entry.beneficiary.toLowerCase());
  if (!beneficiaries.every((entry) => entry === VAULT.toLowerCase())) throw new Error(`${name}: a beneficiary is not the vault`);
  console.log(name, "estimated", String(estimated), "stopLimit", stopLimit, "deadline", swap.transaction.executionParams.deadline);
}

const explorer = await fetchJson(`https://explorer.testnet.arc.io/api/v2/smart-contracts/${ADAPTER}`);
const execute = explorer.abi.find((entry) => entry.type === "function" && entry.name === "execute");
if (!execute) throw new Error("the adapter ABI has no execute");
write("adapter-execute-abi.json", [execute]);
const selector = toFunctionSelector(execute);
if (selector !== "0xaa3e079c") throw new Error(`execute selector is ${selector}, expected 0xaa3e079c`);
console.log("selector", selector, createHash("sha256").update(JSON.stringify(execute)).digest("hex").slice(0, 12));
