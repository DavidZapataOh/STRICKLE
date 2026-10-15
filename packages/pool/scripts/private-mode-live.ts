import { readFileSync } from "node:fs";
import { executeSponsored, networks, rpcUrl, transferSponsored, walletsClient } from "@strickle/arc";
import { MIN_FEE_PER_GAS } from "@strickle/arc/networks";
import { type Address, type Hex, createPublicClient, createWalletClient, erc20Abi, http, keccak256, parseAbi, parseEventLogs, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "../src/abi.ts";
import { ASSET_ID } from "../src/constants.ts";
import { randomField } from "../src/field.ts";
import { ownerPk } from "../src/keys.ts";
import { PoolLedger } from "../src/ledger.ts";
import { type Note, noteCommitment } from "../src/note.ts";
import { policyHash } from "../src/policy.ts";
import { ciphertextHash, shieldLabel } from "../src/pool-client.ts";
import { closeProver, proveShield, proveSpend } from "../src/prove.ts";
import { type VaultRule, policyFromRule } from "../src/private-mode.ts";
import { withDummies } from "../src/witness.ts";

const network = networks.testnet;
const USDC = 1;
const PROFIT = 6;
const amount = 200_000n;
const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8"));
const pool = manifest.contracts.PolicyPool.address as Address;
const poolBlock = BigInt(manifest.contracts.PolicyPool.blockNumber);
const screening = manifest.contracts.ScreeningRegistry.address as Address;
const factory = manifest.contracts.BoxVaultFactory.address as Address;
const explorer = network.explorerUrl;

const vaultAbi = parseAbi([
  "function withdraw(uint8 asset, uint8 box, uint256 amount, address to)",
  "function allocate(uint8 asset, uint8[] boxes, uint256[] amounts)",
  "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
  "function rules(uint8 box) view returns (uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil)",
]);
const factoryAbi = parseAbi(["function vaultOf(address owner) view returns (address)"]);
const screeningAbi = parseAbi(["function setRisks(address[] who, uint8[] risks, bytes32 evidence)", "function status(address who) view returns (uint8 risk, bool fresh)"]);

const circle = walletsClient("testnet");
const publicClient = createPublicClient({ chain: network.chain, transport: http(rpcUrl("testnet")) });
const deployer = privateKeyToAccount(process.env.PRIVATE_KEY?.startsWith("0x") ? (process.env.PRIVATE_KEY as Hex) : (`0x${process.env.PRIVATE_KEY}` as Hex));
const deployerWallet = createWalletClient({ account: deployer, chain: network.chain, transport: http(rpcUrl("testnet")) });
const ownerWalletId = process.env.CIRCLE_GAS_STATION_SCA_WALLET_ID as string;
const owner = (await circle.getWallet({ id: ownerWalletId })).data?.wallet?.address as Address;
const vault = (await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "vaultOf", args: [owner] })) as Address;
if (/^0x0+$/.test(vault)) throw new Error("the owner has no vault yet: run the vault live test first");

interface Receipt {
  step: string;
  tx: Hex;
  detail: string;
}
const receipts: Receipt[] = [];
const record = (step: string, tx: Hex, detail: string) => {
  receipts.push({ step, tx, detail });
  console.log(`receipt | ${step.padEnd(34)} | ${detail} | ${explorer}/tx/${tx}`);
};
const call = (contract: Address, abi: Parameters<typeof executeSponsored>[0]["abi"], functionName: string, args: unknown[]) =>
  executeSponsored({ circle, publicClient, network, walletId: ownerWalletId, contract, abi, functionName, args });
const box = () => publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "boxBalance", args: [USDC, PROFIT] });
const usdcOf = (who: Address) => publicClient.readContract({ address: network.usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] });
const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`check failed: ${message}`);
};

async function main() {
  const [delay, alwaysDelayed, restricted, floor, lockedUntil] = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "rules", args: [PROFIT] });
  const rule: VaultRule = { delay, alwaysDelayed, restricted, floor, lockedUntil };
  const { policy, lockUntil } = policyFromRule(rule, { approvedRecipients: [] });
  console.log(`vault ${vault}: profit box rule ${JSON.stringify(rule, (_, v) => (typeof v === "bigint" ? v.toString() : v))} becomes pool policy ${policyHash(policy).toString(16).slice(0, 12)}...`);

  const boxStart = await box();
  check(boxStart >= amount, "the profit box needs at least 0.2 USDC (run the vault live test)");
  const poolStart = await usdcOf(pool);

  const [risk, fresh] = await publicClient.readContract({ address: screening, abi: screeningAbi, functionName: "status", args: [owner] });
  if (risk !== 0 || !fresh) {
    const hash = await deployerWallet.writeContract({ address: screening, abi: screeningAbi, functionName: "setRisks", args: [[owner], [0], keccak256(toBytes("private-mode-live"))], maxFeePerGas: MIN_FEE_PER_GAS * 4n } as never);
    await publicClient.waitForTransactionReceipt({ hash });
    record("screen the wallet clear", hash, "the screener posts the record when the wallet connects");
  }

  // 1. out of the vault, to the user's own smart account
  const out = await call(vault, vaultAbi, "withdraw", [USDC, PROFIT, amount, owner]);
  record("leave the vault", out.txHash, `${amount} units from the profit box to the owner's account`);
  check((await box()) === boxStart - amount, "the box was debited exactly");

  // 2. into the pool, as a note carrying the box's rule
  const sk = randomField();
  const nonce = (await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "shieldNonce", args: [owner] })) as bigint;
  const label = shieldLabel(owner, nonce);
  const note: Note = { amount, ownerPk: ownerPk(sk), policy: policyHash(policy), label, box: "profit", asset: "USDC", flags: 0, lockUntil, delayFloor: 0, salt: randomField() };
  const shieldProof = await proveShield(note, label);
  const approveTx = await call(network.usdc, parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]), "approve", [pool, amount]);
  record("approve the pool", approveTx.txHash, "exactly the amount");
  const shielded = await call(pool, poolAbi, "shield", [ASSET_ID.USDC, amount, noteCommitment(note), shieldProof.proof, "0x"]);
  record("enter the pool with the box's rule", shielded.txHash, `note commitment ${noteCommitment(note).toString(16).slice(0, 12)}..., policy ${policyHash(policy).toString(16).slice(0, 12)}...`);

  // 3. back out of the pool, privately proven, to the same account
  const ledger = new PoolLedger();
  const head = await publicClient.getBlockNumber();
  const events = [];
  for (let from = poolBlock; from <= head; from += 5_000n) {
    const to = from + 4_999n < head ? from + 4_999n : head;
    events.push(...parseEventLogs({ abi: poolAbi, eventName: "NotesInserted", logs: await publicClient.getLogs({ address: pool, fromBlock: from, toBlock: to }) }));
  }
  for (const event of events) ledger.append(event.args.commitment0, event.args.commitment1);
  check(ledger.root === ((await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "currentRoot" })) as bigint), "ledger root matches the pool");
  const shieldIndex = events.findIndex((event) => event.args.commitment0 === noteCommitment(note)) * 2;
  check(shieldIndex >= 0, "the shield event is in the ledger");

  const empty = (): Note => ({ ...note, amount: 0n, ownerPk: 5n, label: 0n, salt: randomField() });
  const block = await publicClient.getBlock();
  const base = withDummies({
    tree: ledger.tree,
    signer: { kind: "user", sk },
    now: block.timestamp,
    inputs: [{ note, policy, leafIndex: shieldIndex }, null],
    outputs: [{ note: empty() }, { note: empty() }],
    publicAmount: amount,
    recipient: BigInt(owner),
  });
  const ciphertext: Hex = "0x";
  const spend = await proveSpend({ ...base, ciphertextHash: ciphertextHash(ciphertext), now: block.timestamp });
  const [root, n0, n1, c0, c1, publicAmount, recipient, asset, timestamp, , associationRoot, enc0, enc1] = spend.publicInputs as bigint[] as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  const spent = await call(pool, poolAbi, "spend", [spend.proof, { root, nullifiers: [n0, n1], commitments: [c0, c1], publicAmount, recipient, asset, timestamp, associationRoot, enc: [enc0, enc1] }, ciphertext]);
  record("leave the pool to the same account", spent.txHash, `${amount} units, proven privately`);

  // 4. back into the box
  const moved = await transferSponsored({ circle, network, walletAddress: owner, to: vault, token: network.usdc, amount: "0.2" });
  record("send the funds to the vault", moved, "arrives unallocated");
  const allocated = await call(vault, vaultAbi, "allocate", [USDC, [PROFIT], [amount]]);
  record("put them back in the profit box", allocated.txHash, "the box is whole again");

  check((await box()) === boxStart, "the box has exactly its starting balance");
  check((await usdcOf(pool)) === poolStart, "the pool holds what it held before");
  const after = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "rules", args: [PROFIT] });
  check(after[0] === rule.delay && after[1] === rule.alwaysDelayed && after[2] === rule.restricted && after[3] === rule.floor && after[4] === rule.lockedUntil, "the box rule is unchanged");
  console.log(`done: ${receipts.length} receipts; the box went out of the vault, into the pool with its rule and back, with the same balance`);
}

try {
  await main();
} finally {
  await closeProver();
}
