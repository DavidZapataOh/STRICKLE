import { readFileSync } from "node:fs";
import { MIN_FEE_PER_GAS, networks, rpcUrl } from "@strickle/arc/networks";
import { type Address, type Hex, concatHex, createPublicClient, createWalletClient, erc20Abi, http, keccak256, parseEventLogs, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "../src/abi.ts";
import { ASSET_ID } from "../src/constants.ts";
import { randomField } from "../src/field.ts";
import { ownerPk } from "../src/keys.ts";
import { PoolLedger } from "../src/ledger.ts";
import { MerkleTree } from "../src/merkle.ts";
import { type Note, noteCommitment } from "../src/note.ts";
import { FREE_POLICY, type Policy, policyHash } from "../src/policy.ts";
import { addressToField, ciphertextHash, shieldLabel } from "../src/pool-client.ts";
import { closeProver, executeCircuit, proveShield, proveSpend } from "../src/prove.ts";
import { type SpendSpec, buildSpendInputs, recipientLeaf } from "../src/witness.ts";

const network = "testnet";
const USDC = 1_000_000n;
const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8"));
const pool = manifest.contracts.PolicyPool.address as Address;
const deployBlock = BigInt(manifest.contracts.PolicyPool.blockNumber);
const usdc = networks[network].usdc;
const explorer = networks[network].explorerUrl;

if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is not set");
const account = privateKeyToAccount(process.env.PRIVATE_KEY.startsWith("0x") ? (process.env.PRIVATE_KEY as Hex) : `0x${process.env.PRIVATE_KEY}`);
const transport = http(rpcUrl(network));
const publicClient = createPublicClient({ chain: networks[network].chain, transport });
const wallet = createWalletClient({ account, chain: networks[network].chain, transport });

async function fees() {
  const estimate = await publicClient.estimateFeesPerGas();
  const max = estimate.maxFeePerGas > MIN_FEE_PER_GAS ? estimate.maxFeePerGas : MIN_FEE_PER_GAS;
  return { maxFeePerGas: max * 2n, maxPriorityFeePerGas: estimate.maxPriorityFeePerGas };
}

async function send(label: string, request: Parameters<typeof wallet.writeContract>[0]) {
  const hash = await wallet.writeContract({ ...request, ...(await fees()) } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: gas ${receipt.gasUsed}  ${explorer}/tx/${hash}`);
  return receipt;
}

const ledger = new PoolLedger();

async function rebuildLedgerFromEvents(): Promise<void> {
  const head = await publicClient.getBlockNumber();
  const logs = [];
  for (let from = deployBlock; from <= head; from += 5_000n) {
    const to = from + 4_999n < head ? from + 4_999n : head;
    logs.push(...parseEventLogs({ abi: poolAbi, eventName: "NotesInserted", logs: await publicClient.getLogs({ address: pool, fromBlock: from, toBlock: to }) }));
  }
  for (const log of logs) {
    if (BigInt(ledger.tree.size) !== BigInt(log.args.index)) throw new Error(`event gap at index ${log.args.index}`);
    ledger.append(log.args.commitment0, log.args.commitment1);
  }
  const onChain = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "currentRoot" });
  if (onChain !== ledger.root) throw new Error("the tree rebuilt from events does not match the contract root");
  console.log(`ledger rebuilt from ${logs.length} events; root matches the contract`);
}

function absorb(receipt: Awaited<ReturnType<typeof send>>): number {
  const [event] = parseEventLogs({ abi: poolAbi, eventName: "NotesInserted", logs: receipt.logs });
  if (!event) throw new Error("no NotesInserted event in the receipt");
  return ledger.append(event.args.commitment0, event.args.commitment1);
}

const filler = (seed: string): Hex => concatHex([1, 2, 3].map((part) => keccak256(toBytes(`${seed}-${part}`))));
const balanceOf = (who: Address) => publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] });
const totalShielded = () => publicClient.readContract({ address: pool, abi: poolAbi, functionName: "totalShielded", args: [1] });

async function main(): Promise<void> {
  await rebuildLedgerFromEvents();

  const sk = randomField();
  const owner = ownerPk(sk);
  const nonce = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "shieldNonce", args: [account.address] });
  const label = shieldLabel(account.address, nonce);
  const payee = account.address;
  const allowlist = new MerkleTree(10);
  allowlist.insert(recipientLeaf(addressToField(payee)));
  const payroll: Policy = { ...FREE_POLICY, restricted: true, allowlistRoot: allowlist.root };

  const make = (amount: bigint, box: Note["box"], policy: Policy): Note => ({
    amount,
    ownerPk: owner,
    policy: policyHash(policy),
    label,
    box,
    asset: "USDC",
    flags: 0,
    lockUntil: 0n,
    salt: randomField(),
  });
  const filler0 = (): Note => ({ ...make(0n, "operating", FREE_POLICY), ownerPk: 5n, label: 0n });

  const poolBefore = await balanceOf(pool);
  const totalBefore = await totalShielded();
  const walletBefore = await balanceOf(account.address);

  const n0 = make(1n * USDC, "operating", FREE_POLICY);
  console.log("proving the shield...");
  const shield = await proveShield(n0, label);
  await send("approve", { address: usdc, abi: erc20Abi, functionName: "approve", args: [pool, 1n * USDC] });
  const shieldIndex = absorb(
    await send("shield 1 USDC", {
      address: pool,
      abi: poolAbi,
      functionName: "shield",
      args: [ASSET_ID.USDC, 1n * USDC, noteCommitment(n0), shield.proof, filler("shield")],
    }),
  );

  const stepNow = async () => (await publicClient.getBlock()).timestamp;
  const spend = async (name: string, spec: Omit<SpendSpec, "tree" | "signer" | "now" | "ciphertextHash">) => {
    const ciphertext = filler(name);
    const full: SpendSpec = { ...spec, tree: ledger.tree, signer: { kind: "user", sk }, now: await stepNow(), ciphertextHash: ciphertextHash(ciphertext) };
    console.log(`proving ${name}...`);
    const { proof, publicInputs, outputNotes } = await proveSpend(full);
    const [root, nf0, nf1, c0, c1, publicAmount, recipient, asset, timestamp, , associationRoot, enc0, enc1] = publicInputs as [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    ];
    const receipt = await send(name, {
      address: pool,
      abi: poolAbi,
      functionName: "spend",
      args: [proof, { root, nullifiers: [nf0, nf1], commitments: [c0, c1], publicAmount, recipient, asset, timestamp, associationRoot, enc: [enc0, enc1] }, ciphertext],
    });
    return { index: absorb(receipt), notes: outputNotes };
  };

  const split = await spend("split into payroll and operating", {
    inputs: [{ note: n0, policy: FREE_POLICY, leafIndex: shieldIndex }, null],
    outputs: [{ note: make(600_000n, "payroll", payroll) }, { note: make(400_000n, "operating", FREE_POLICY) }],
  });
  const [payrollNote, operatingNote] = split.notes as [Note, Note];

  const strangerSpec: SpendSpec = {
    tree: ledger.tree,
    signer: { kind: "user", sk },
    now: await stepNow(),
    inputs: [{ note: payrollNote, policy: payroll, leafIndex: split.index }, null],
    outputs: [{ note: filler0() }, { note: filler0() }],
    publicAmount: 600_000n,
    recipient: addressToField("0x000000000000000000000000000000000000dEaD"),
    allowlist: { tree: allowlist, index: 0 },
  };
  await executeCircuit("spend", buildSpendInputs(strangerSpec).inputs).then(
    () => {
      throw new Error("the payroll box paid a recipient outside its allowlist");
    },
    () => console.log("rule check: the payroll box cannot pay an address outside its allowlist (no proof exists)"),
  );

  await spend("pay the approved payee from payroll", {
    inputs: [{ note: payrollNote, policy: payroll, leafIndex: split.index }, null],
    outputs: [{ note: filler0() }, { note: filler0() }],
    publicAmount: 600_000n,
    recipient: addressToField(payee),
    allowlist: { tree: allowlist, index: 0 },
  });
  await spend("pay out the operating box", {
    inputs: [{ note: operatingNote, policy: FREE_POLICY, leafIndex: split.index + 1 }, null],
    outputs: [{ note: filler0() }, { note: filler0() }],
    publicAmount: 400_000n,
    recipient: addressToField(payee),
  });

  const poolAfter = await balanceOf(pool);
  const totalAfter = await totalShielded();
  const walletAfter = await balanceOf(account.address);
  if (poolAfter !== poolBefore || totalAfter !== totalBefore) throw new Error("the pool did not return to its starting balance");
  console.log(`done: 1 USDC went in, split across boxes, and came out; pool balance ${poolAfter}, accounted ${totalAfter}`);
  console.log(`depositor balance change (the difference is the gas paid in USDC): ${walletAfter - walletBefore} base units`);
}

try {
  await main();
} finally {
  await closeProver();
}
