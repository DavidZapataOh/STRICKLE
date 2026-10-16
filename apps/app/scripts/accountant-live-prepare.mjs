// usage: node --env-file=/Users/david/tameion/.env apps/app/scripts/accountant-live-prepare.mjs
// Shields one real USDC as a payroll note sealed for its owner and for a fresh accountant key, and saves that key for the live spec. Uses the shared deployer key: owner go-ahead needed.
import { readFileSync, writeFileSync } from "node:fs";
import { MIN_FEE_PER_GAS, networks } from "@strickle/arc/networks";
import { createPublicClient, createWalletClient, erc20Abi, http, keccak256, parseAbi, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "@strickle/pool/abi";
import { ASSET_ID } from "@strickle/pool/constants";
import { sealEnvelope } from "@strickle/pool/crypto/envelope";
import { ViewKeyRing } from "@strickle/pool/crypto/keyring";
import { deriveOwnerViewKey, generateViewKey } from "@strickle/pool/crypto/keys";
import { randomField } from "@strickle/pool/field";
import { ownerPk } from "@strickle/pool/keys";
import { noteCommitment } from "@strickle/pool/note";
import { FREE_POLICY, policyHash } from "@strickle/pool/policy";
import { shieldLabel } from "@strickle/pool/pool-client";
import { closeProver, proveShield } from "@strickle/pool/prove";

const network = networks.testnet;
const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8"));
const pool = manifest.contracts.PolicyPool.address;
const screening = manifest.contracts.ScreeningRegistry.address;
const client = createPublicClient({ transport: http(network.rpcUrl) });
const account = privateKeyToAccount(process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`);
const wallet = createWalletClient({ account, chain: network.chain, transport: http(network.rpcUrl) });

const send = async (label, request) => {
  const fees = await client.estimateFeesPerGas();
  const hash = await wallet.writeContract({ ...request, maxFeePerGas: (fees.maxFeePerGas > MIN_FEE_PER_GAS ? fees.maxFeePerGas : MIN_FEE_PER_GAS) * 2n, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  return receipt;
};

await send("screen the depositor", { address: screening, abi: parseAbi(["function setRisks(address[] who, uint8[] risks, bytes32 evidence)"]), functionName: "setRisks", args: [[account.address], [0], keccak256(toBytes(`accountant-live ${Date.now()}`))] });

const sk = randomField();
const accountant = generateViewKey();
const ring = new ViewKeyRing(deriveOwnerViewKey(sk));
ring.setAccountant(accountant.publicKey);
const nonce = await client.readContract({ address: pool, abi: poolAbi, functionName: "shieldNonce", args: [account.address] });
const label = shieldLabel(account.address, nonce);
const note = { amount: 1_000_000n, ownerPk: ownerPk(sk), policy: policyHash(FREE_POLICY), label, box: "payroll", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: randomField() };

console.log("proving the shield locally...");
const shield = await proveShield(note, label);
await closeProver();
await send("approve", { address: network.usdc, abi: erc20Abi, functionName: "approve", args: [pool, 1_000_000n] });
const receipt = await send("shield 1 USDC", { address: pool, abi: poolAbi, functionName: "shield", args: [ASSET_ID.USDC, 1_000_000n, noteCommitment(note), shield.proof, sealEnvelope([{ note, policy: FREE_POLICY, viewers: ring.viewers() }, null])] });
writeFileSync("/private/tmp/claude-501/accountant-live.json", JSON.stringify({ secret: accountant.secret.toString(16).padStart(64, "0"), amount: "1000000", box: "payroll" }));
console.log(`shielded 1 USDC as a payroll note sealed for the accountant key; transaction ${receipt.transactionHash}`);
