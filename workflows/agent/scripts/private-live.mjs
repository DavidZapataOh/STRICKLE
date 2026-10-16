// workflows/agent/scripts/private-live.mjs
// usage: private-live.mjs prepare | request <workflow id> | verify
import { readFileSync, writeFileSync } from "node:fs";
import { MIN_FEE_PER_GAS } from "@strickle/arc/networks";
import { createWalletClient, erc20Abi, getAddress, http, keccak256, parseEventLogs, toBytes, parseAbi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "@strickle/pool/abi";
import { AGENT_ACTION, ASSET_ID } from "@strickle/pool/constants";
import { sealEnvelope } from "@strickle/pool/crypto/envelope";
import { ViewKeyRing } from "@strickle/pool/crypto/keyring";
import { deriveOwnerViewKey } from "@strickle/pool/crypto/keys";
import { randomField } from "@strickle/pool/field";
import { agentKeyHash, authHash, nullifierKey, ownerPk } from "@strickle/pool/keys";
import { MerkleTree } from "@strickle/pool/merkle";
import { noteCommitment, noteNullifier } from "@strickle/pool/note";
import { FREE_POLICY, policyHash } from "@strickle/pool/policy";
import { addressToField, shieldLabel } from "@strickle/pool/pool-client";
import { closeProver, proveShield } from "@strickle/pool/prove";
import { noteToWire, policyToWire } from "@strickle/pool/spec-wire";
import { recipientLeaf } from "@strickle/pool/witness";
import { triggerWorkflow } from "./gateway.mjs";
import { abi, context, readProfile, sealRequest, signAction, submitProfile, waitFor } from "./live-support.mjs";

const STATE_FILE = "/private/tmp/claude-501/private-live.json";
const AMOUNT = 300_000n;
const [command, arg] = process.argv.slice(2);
const ctx = await context();
const { publicClient, contracts, vault, network } = ctx;
const pool = contracts.PolicyPool.address;
const screeningAddress = contracts.ScreeningRegistry.address;
const openState = async () => ({ profile: await readProfile(ctx) });

if (command === "prepare") {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`);
  const wallet = createWalletClient({ account, chain: network.chain, transport: http(network.rpcUrl) });
  const send = async (label, request) => {
    const fees = await publicClient.estimateFeesPerGas();
    const hash = await wallet.writeContract({ ...request, maxFeePerGas: (fees.maxFeePerGas > MIN_FEE_PER_GAS ? fees.maxFeePerGas : MIN_FEE_PER_GAS) * 2n, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    return receipt;
  };
  await send("screen the depositor", { address: screeningAddress, abi: parseAbi(["function setRisks(address[] who, uint8[] risks, bytes32 evidence)"]), functionName: "setRisks", args: [[account.address], [0], keccak256(toBytes(`private-live ${Date.now()}`))] });

  const sk = randomField();
  const ak = randomField();
  const nk = nullifierKey(sk);
  const auth = authHash(sk);
  const owner = ownerPk(sk);
  const ring = new ViewKeyRing(deriveOwnerViewKey(sk));
  const payee = privateKeyToAccount(generatePrivateKey()).address;
  const allowlist = new MerkleTree(10);
  allowlist.insert(recipientLeaf(addressToField(payee)));
  const policy = { ...FREE_POLICY, restricted: true, allowlistRoot: allowlist.root, agentKeyHash: agentKeyHash(ak), agentCap: 600_000n, agentActions: AGENT_ACTION.PAY_ALLOWLISTED };
  const nonce = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "shieldNonce", args: [account.address] });
  const label = shieldLabel(account.address, nonce);
  const note = { amount: 1_000_000n, ownerPk: owner, policy: policyHash(policy), label, box: "payroll", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: randomField() };

  console.log("proving the shield locally...");
  const shield = await proveShield(note, label);
  await closeProver();
  await send("approve", { address: network.usdc, abi: erc20Abi, functionName: "approve", args: [pool, 1_000_000n] });
  const receipt = await send("shield 1 USDC", { address: pool, abi: poolAbi, functionName: "shield", args: [ASSET_ID.USDC, 1_000_000n, noteCommitment(note), shield.proof, sealEnvelope([{ note, policy, viewers: ring.viewers() }, null])] });
  const [inserted] = parseEventLogs({ abi: poolAbi, eventName: "NotesInserted", logs: receipt.logs });
  const leafIndex = Number(inserted.args.index);
  const totalBefore = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "totalShielded", args: [1] });

  // the executor was redeployed with an empty registry: register the vault (owner only) before anything else
  const executor = contracts.AgentExecutor.address;
  if (!(await publicClient.readContract({ address: executor, abi: abi.executor, functionName: "registered", args: [vault] }))) await ctx.call(executor, abi.executor, "register", [vault]);

  await submitProfile(ctx, {
    version: 1, taxRateBps: 0, taxBufferBps: 10500, payrollShareBps: 10000, floorDays: 14, targetDays: 42,
    dailySpend: "20000", payrollDue: "0", salaryOwed: "0", emergencyTarget: "0",
    privateMode: {
      enabled: true, ak: String(ak), nk: String(nk), authHash: String(auth), ownerPk: String(owner),
      viewers: ring.viewers().map((viewer) => ({ tier: viewer.tier, publicKey: `0x${Buffer.from(viewer.publicKey).toString("hex")}` })),
      notes: [{ note: noteToWire(note), policy: policyToWire(policy), allowlist: [payee], leafIndex }],
    },
  });
  writeFileSync(STATE_FILE, JSON.stringify({ payee, nullifier: noteNullifier(nk, noteCommitment(note), leafIndex).toString(), totalBefore: totalBefore.toString(), fromBlock: receipt.blockNumber.toString() }));
  console.log(`prepared: 1 USDC shielded as a payroll note (leaf ${leafIndex}), the agent's keys sealed into the profile, payee ${payee}`);
} else if (command === "request") {
  const { profile } = await openState();
  const nonce = BigInt(profile.nonce) + 1n;
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const { payee } = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const action = { kind: "pay", box: "payroll", to: payee, amount: String(AMOUNT) };
  const signature = await signAction(ctx, action, nonce, deadline);
  const input = await sealRequest(ctx, { vault, action, nonce: String(nonce), deadline, signature });
  const answer = await triggerWorkflow({ url: process.env.CRE_GATEWAY_URL ?? "https://01.gateway.zone-a.cre.chain.link", workflowId: arg, privateKey: process.env.CRE_GATEWAY_KEY, input });
  if (answer.result?.status !== "ACCEPTED") throw new Error(`the gateway did not accept the request: ${JSON.stringify(answer)}`);
  console.log("request accepted by the gateway");
} else if (command === "verify") {
  const saved = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const payeeBalance = () => publicClient.readContract({ address: network.usdc, abi: erc20Abi, functionName: "balanceOf", args: [saved.payee] });
  await waitFor(async () => (await payeeBalance()) === AMOUNT, "the private payment to reach the payee", 600);
  const total = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "totalShielded", args: [1] });
  if (BigInt(saved.totalBefore) - total !== AMOUNT) throw new Error("the pool's shielded total did not fall by exactly the payment");
  const events = await publicClient.getContractEvents({ address: pool, abi: poolAbi, eventName: "Spent", fromBlock: BigInt(saved.fromBlock) });
  const spent = events.find((event) => event.args.publicAmount === AMOUNT && getAddress(event.args.recipient) === getAddress(saved.payee));
  if (!spent) throw new Error("no Spent event with the public payment");
  if (spent.args.nullifier0.toString() !== saved.nullifier) throw new Error("the spent nullifier is not the note the agent was given");
  const { profile } = await openState();
  const [change] = profile.privateMode.notes;
  if (profile.privateMode.notes.length !== 1 || change.note.amount !== "700000" || change.leafIndex !== null) throw new Error("the agent's state does not hold exactly the change note");
  console.log(`private spend: ${AMOUNT} paid to ${saved.payee}, nullifier ${saved.nullifier} spent, change note of 700000 kept in the encrypted state, nonce ${profile.nonce}`);
} else {
  throw new Error("usage: private-live.mjs prepare | request <workflow id> | verify");
}
