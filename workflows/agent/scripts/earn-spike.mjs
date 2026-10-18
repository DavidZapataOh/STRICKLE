import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { EarnChain, EarnKit } from "@circle-fin/earn-kit";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.blockdaemon.testnet.arc.io";
const VAULT = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
const USDC = "0x3600000000000000000000000000000000000000";
const BASE = "https://api.circle.com/v1/earnKit";
const AMOUNT = process.argv[2] ?? "2";
const out = new URL("../tests/fixtures/earn/", import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, value) => writeFileSync(new URL(name, out), `${JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);

const raw = process.env.PRIVATE_KEY;
if (!raw) throw new Error("PRIVATE_KEY is not set");
const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
const owner = privateKeyToAccount(privateKey).address;
const client = createPublicClient({ transport: http(RPC) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const balance = (token) => client.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] });
const post = async (path, body) => {
  const response = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return response.json();
};

// A real deposit and withdrawal through the kit from an externally owned account: learns who receives the shares and captures the withdrawal bundle and both receipts.
const adapter = createViemAdapterFromPrivateKey({
  privateKey,
  getPublicClient: ({ chain }) => createPublicClient({ chain, transport: http(RPC) }),
  getWalletClient: ({ chain, account }) => createWalletClient({ chain, account, transport: http(RPC) }),
});
const kit = new EarnKit();
const from = { adapter, chain: EarnChain.Arc_Testnet };
const usdcBefore = await balance(USDC);
console.log(`account ${owner}: ${formatUnits(usdcBefore, 6)} USDC`);
if (usdcBefore < BigInt(Math.round(Number(AMOUNT) * 1e6)) + 1_000_000n) throw new Error("too little USDC for the deposit and its gas");

const deposit = await kit.deposit({ from, vaultAddress: VAULT, amount: AMOUNT });
const depositReceipt = await client.waitForTransactionReceipt({ hash: deposit.txHash });
write("earn-deposit-receipt.json", depositReceipt);
console.log(`deposit ${deposit.txHash} (${depositReceipt.status}), logs ${depositReceipt.logs.length}`);

const request = { vaultAddress: VAULT, amount: AMOUNT, address: owner, chain: "ARC-TESTNET" };
// the service indexes a new position a little after the deposit: ask until it answers
let quoted;
for (let attempt = 0; attempt < 30 && !quoted?.data; attempt += 1) {
  quoted = await post("/withdrawal/quote", request);
  if (!quoted?.data) await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!quoted?.data) throw new Error(`the service never saw the position: ${JSON.stringify(quoted)}`);
write("withdrawal-quote.json", quoted);
write("withdraw.json", await post("/withdraw", request));

const withdrawal = await kit.withdraw({ from, vaultAddress: VAULT, amount: AMOUNT });
const withdrawReceipt = await client.waitForTransactionReceipt({ hash: withdrawal.txHash });
write("earn-withdraw-receipt.json", withdrawReceipt);
const usdcAfter = await balance(USDC);
console.log(`withdraw ${withdrawal.txHash} (${withdrawReceipt.status}); net ${formatUnits(usdcAfter - usdcBefore, 6)} USDC (gas included)`);
