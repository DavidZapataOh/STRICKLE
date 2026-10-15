import { readFileSync } from "node:fs";
import { MIN_FEE_PER_GAS, networks, rpcUrl } from "@strickle/arc/networks";
import { BaseError, ContractFunctionRevertedError, type Address, type Hex, createPublicClient, createWalletClient, erc20Abi, http, keccak256, parseAbi, parseEventLogs, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "../src/abi.ts";
import { buildAssociationSet } from "../src/association.ts";
import { ASSET_ID } from "../src/constants.ts";
import { combinePartials, dealAuthority, partialDecrypt } from "../src/crypto/authority.ts";
import { type OutputPlaintext, envelopeEpk, openSection, sealEnvelope } from "../src/crypto/envelope.ts";
import { ViewKeyRing } from "../src/crypto/keyring.ts";
import { deriveOwnerViewKey, generateViewKey } from "../src/crypto/keys.ts";
import { openOwnerNote } from "../src/crypto/scan.ts";
import { decodeAccountantPayload, decodeAuthorityPayload } from "../src/crypto/wire.ts";
import { randomField } from "../src/field.ts";
import { nullifierKey, ownerPk } from "../src/keys.ts";
import { PoolLedger } from "../src/ledger.ts";
import { MerkleTree } from "../src/merkle.ts";
import { type Note, noteCommitment } from "../src/note.ts";
import { FREE_POLICY, type Policy, policyHash } from "../src/policy.ts";
import { addressToField, ciphertextHash, shieldLabel } from "../src/pool-client.ts";
import { closeProver, executeCircuit, proveShield, proveSpend } from "../src/prove.ts";
import { type Candidate, recoverSelfNotes } from "../src/recover.ts";
import { type SpendSpec, buildSpendInputs, deriveOutputNotes, recipientLeaf, withDummies } from "../src/witness.ts";

const network = "testnet";
const USDC = 1_000_000n;
const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8"));
const pool = manifest.contracts.PolicyPool.address as Address;
const deployBlock = BigInt(manifest.contracts.PolicyPool.blockNumber);
const screeningAddress = manifest.contracts.ScreeningRegistry.address as Address;
const associationAddress = manifest.contracts.AssociationRegistry.address as Address;
const screeningAbi = parseAbi([
  "function setRisks(address[] who, uint8[] risks, bytes32 evidence)",
  "function status(address who) view returns (uint8 risk, bool fresh)",
]);
const associationAbi = parseAbi([
  "function publish(uint256 root, bytes32 evidence)",
  "function revoke(uint256 root)",
  "function isApproved(uint256 root) view returns (bool)",
]);
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

type Receipt = Awaited<ReturnType<typeof send>>;

interface SpendCallInputs {
  root: bigint;
  nullifiers: [bigint, bigint];
  commitments: [bigint, bigint];
  publicAmount: bigint;
  recipient: bigint;
  asset: number;
  timestamp: bigint;
  associationRoot: bigint;
  enc: [bigint, bigint];
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

function inserted(receipt: Receipt) {
  const [event] = parseEventLogs({ abi: poolAbi, eventName: "NotesInserted", logs: receipt.logs });
  if (!event) throw new Error("no NotesInserted event in the receipt");
  return event.args;
}

const balanceOf = (who: Address) => publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] });
const totalShielded = () => publicClient.readContract({ address: pool, abi: poolAbi, functionName: "totalShielded", args: [1] });

function revertName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined;
}

async function expectRefusal(description: string, errorName: string, attempt: () => Promise<unknown>): Promise<void> {
  try {
    await attempt();
  } catch (error) {
    const name = revertName(error);
    if (name === errorName) {
      console.log(`refused as expected: ${description} (${errorName})`);
      return;
    }
    throw new Error(`${description}: expected ${errorName}, got ${name ?? String(error)}`);
  }
  throw new Error(`${description}: expected ${errorName}, but the call succeeded`);
}

const attemptShield = (who: Address, amount: bigint) =>
  publicClient.simulateContract({ address: pool, abi: poolAbi, functionName: "shield", args: [ASSET_ID.USDC, amount, 1n, "0x", "0x"], account: who });

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`check failed: ${message}`);
}

async function readDeposits() {
  const head = await publicClient.getBlockNumber();
  const found: { depositor: Address; label: bigint; timestamp: number }[] = [];
  const timestamps = new Map<bigint, number>();
  for (let from = deployBlock; from <= head; from += 5_000n) {
    const to = from + 4_999n < head ? from + 4_999n : head;
    const logs = parseEventLogs({ abi: poolAbi, eventName: "Shielded", logs: await publicClient.getLogs({ address: pool, fromBlock: from, toBlock: to }) });
    for (const log of logs) {
      if (!timestamps.has(log.blockNumber)) timestamps.set(log.blockNumber, Number((await publicClient.getBlock({ blockNumber: log.blockNumber })).timestamp));
      found.push({ depositor: log.args.depositor, label: log.args.label, timestamp: timestamps.get(log.blockNumber) as number });
    }
  }
  return found;
}

async function main(): Promise<void> {
  await rebuildLedgerFromEvents();

  const sk = randomField();
  const nk = nullifierKey(sk);
  const owner = ownerPk(sk);
  const ownerView = deriveOwnerViewKey(sk);
  const accountant = generateViewKey();
  const authority = dealAuthority(2, 3);
  const ring = new ViewKeyRing(ownerView);
  ring.setAccountant(accountant.publicKey);
  ring.setAuthority(authority.publicKey);

  const nonce = await publicClient.readContract({ address: pool, abi: poolAbi, functionName: "shieldNonce", args: [account.address] });
  const label = shieldLabel(account.address, nonce);
  const payee = account.address;
  const allowlist = new MerkleTree(10);
  allowlist.insert(recipientLeaf(addressToField(payee)));
  const payroll: Policy = { ...FREE_POLICY, restricted: true, allowlistRoot: allowlist.root };
  const candidates: Candidate[] = [
    { box: "payroll", asset: "USDC", policy: payroll, label },
    { box: "operating", asset: "USDC", policy: FREE_POLICY, label },
  ];

  const make = (amount: bigint, box: Note["box"], policy: Policy): Note => ({ amount, ownerPk: owner, policy: policyHash(policy), label, box, asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: randomField() });
  const empty = (): Note => ({ ...make(0n, "operating", FREE_POLICY), ownerPk: 5n, label: 0n });
  const seal = (notes: Note[], policies: Policy[]) =>
    sealEnvelope(notes.map((n, j): OutputPlaintext | null => (n.amount > 0n ? { note: n, policy: policies[j] as Policy, viewers: ring.viewers() } : null)) as [OutputPlaintext | null, OutputPlaintext | null]);

  const poolBefore = await balanceOf(pool);
  const totalBefore = await totalShielded();
  const walletBefore = await balanceOf(account.address);

  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const listed = privateKeyToAccount(generatePrivateKey()).address;
  const neighbour = privateKeyToAccount(generatePrivateKey()).address;
  const screeningEvidence = keccak256(toBytes(JSON.stringify({ source: "pool-live", at: Date.now() })));
  await send("screen the depositor clear, one wallet blocked, one elevated", {
    address: screeningAddress,
    abi: screeningAbi,
    functionName: "setRisks",
    args: [[account.address, listed, neighbour], [0, 2, 1], screeningEvidence],
  });
  await expectRefusal("a never-screened wallet cannot deposit", "NotScreened", () => attemptShield(stranger, 1n * USDC));
  await expectRefusal("a blocked wallet cannot deposit", "Blocked", () => attemptShield(listed, 1n * USDC));
  await expectRefusal("an elevated wallet is held to a quarter of the cap", "UserCapExceeded", () => attemptShield(neighbour, 251n * USDC));

  const n0 = make(1n * USDC, "operating", FREE_POLICY);
  console.log("proving the shield...");
  const shield = await proveShield(n0, label);
  await send("approve", { address: usdc, abi: erc20Abi, functionName: "approve", args: [pool, 1n * USDC] });
  const shieldReceipt = await send("shield 1 USDC", {
    address: pool,
    abi: poolAbi,
    functionName: "shield",
    args: [ASSET_ID.USDC, 1n * USDC, noteCommitment(n0), shield.proof, seal([n0, empty()], [FREE_POLICY, FREE_POLICY])],
  });
  const shieldEvent = inserted(shieldReceipt);
  const shieldIndex = ledger.append(shieldEvent.commitment0, shieldEvent.commitment1);
  const shieldOpened = openOwnerNote(shieldEvent.ciphertext, 0, ownerView, noteCommitment(n0));
  check(shieldOpened !== undefined && shieldOpened.note.amount === 1n * USDC, "the owner opens the shielded note from the chain envelope");

  const stepNow = async () => (await publicClient.getBlock()).timestamp;
  const seen: { ciphertext: Hex; notes: Note[] }[] = [];

  const spend = async (
    name: string,
    spec: Omit<SpendSpec, "tree" | "signer" | "now" | "ciphertextHash">,
    policies: Policy[],
    beforeSend?: (call: { proof: Hex; inputs: SpendCallInputs; ciphertext: Hex }) => Promise<void>,
  ) => {
    const base = withDummies({ ...spec, tree: ledger.tree, signer: { kind: "user", sk }, now: await stepNow() });
    const ciphertext = seal(deriveOutputNotes(base).notes, policies);
    console.log(`proving ${name}...`);
    const { proof, publicInputs, outputNotes } = await proveSpend({ ...base, ciphertextHash: ciphertextHash(ciphertext) });
    const [root, nf0, nf1, c0, c1, publicAmount, recipient, asset, timestamp, , associationRoot, enc0, enc1] = publicInputs as [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    ];
    const inputs: SpendCallInputs = { root, nullifiers: [nf0, nf1], commitments: [c0, c1], publicAmount, recipient, asset: Number(asset), timestamp, associationRoot, enc: [enc0, enc1] };
    await beforeSend?.({ proof, inputs, ciphertext });
    const receipt = await send(name, { address: pool, abi: poolAbi, functionName: "spend", args: [proof, inputs, ciphertext] });
    const event = inserted(receipt);
    const index = ledger.append(event.commitment0, event.commitment1);

    const recovered = recoverSelfNotes({ nk, ownerPk: owner, transaction: { nullifier0: nf0, commitments: [c0, c1], enc: [enc0, enc1], firstIndex: index }, candidates });
    const expected = outputNotes.filter((n) => n.amount > 0n);
    check(recovered.length === expected.length && recovered.every((r, i) => noteCommitment(r.note) === noteCommitment(expected[i] as Note)), `${name}: self notes recovered from public data and nk`);
    seen.push({ ciphertext: event.ciphertext, notes: outputNotes });
    return { index, notes: outputNotes };
  };

  const split = await spend(
    "split into payroll and operating",
    { inputs: [{ note: n0, policy: FREE_POLICY, leafIndex: shieldIndex }, null], outputs: [{ note: make(600_000n, "payroll", payroll) }, { note: make(400_000n, "operating", FREE_POLICY) }] },
    [payroll, FREE_POLICY],
  );
  const [payrollNote, operatingNote] = split.notes as [Note, Note];

  const strangerSpec: SpendSpec = {
    tree: ledger.tree,
    signer: { kind: "user", sk },
    now: await stepNow(),
    inputs: [{ note: payrollNote, policy: payroll, leafIndex: split.index }, null],
    outputs: [{ note: empty() }, { note: empty() }],
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

  await spend(
    "pay the approved payee from payroll",
    { inputs: [{ note: payrollNote, policy: payroll, leafIndex: split.index }, null], outputs: [{ note: empty() }, { note: empty() }], publicAmount: 600_000n, recipient: addressToField(payee), allowlist: { tree: allowlist, index: 0 } },
    [FREE_POLICY, FREE_POLICY],
  );

  ring.revokeAccountant();
  console.log("accountant revoked");

  const deposits = await readDeposits();
  const statuses = new Map<Address, 0 | 1 | 2 | undefined>();
  for (const depositor of new Set(deposits.map((d) => d.depositor))) {
    const [risk, fresh] = await publicClient.readContract({ address: screeningAddress, abi: screeningAbi, functionName: "status", args: [depositor] });
    statuses.set(depositor, fresh ? (risk as 0 | 1 | 2) : undefined);
  }
  const set = buildAssociationSet({ deposits, statusOf: (address) => statuses.get(address) });
  const position = set.proofFor(label);
  console.log(`association set of ${set.labels.length} clear deposits; our label is at position ${position.index}`);
  const setEvidence = keccak256(toBytes(JSON.stringify({ provider: account.address, labels: set.labels.length })));

  await spend(
    "pay out the operating box with an association-set proof",
    {
      inputs: [{ note: operatingNote, policy: FREE_POLICY, leafIndex: split.index + 1 }, null],
      outputs: [{ note: empty() }, { note: empty() }],
      publicAmount: 400_000n,
      recipient: addressToField(payee),
      association: { tree: position.tree, index: position.index },
    },
    [FREE_POLICY, FREE_POLICY],
    async ({ proof, inputs, ciphertext }) => {
      await expectRefusal("a withdrawal backed by a set nobody published", "UnknownAssociationRoot", () =>
        publicClient.simulateContract({ address: pool, abi: poolAbi, functionName: "spend", args: [proof, inputs, ciphertext], account: account.address }),
      );
      await send("publish the association set", { address: associationAddress, abi: associationAbi, functionName: "publish", args: [set.tree.root, setEvidence] });
    },
  );
  await send("revoke the association set", { address: associationAddress, abi: associationAbi, functionName: "revoke", args: [set.tree.root] });
  check(!(await publicClient.readContract({ address: associationAddress, abi: associationAbi, functionName: "isApproved", args: [set.tree.root] })), "a revoked set no longer backs withdrawals");

  // Viewing tiers, read back from what the chain stored.
  const [splitTx, , lastTx] = seen as [(typeof seen)[number], (typeof seen)[number], (typeof seen)[number]];
  for (const [j, note] of splitTx.notes.entries()) {
    const view = decodeAccountantPayload(openSection(splitTx.ciphertext, j as 0 | 1, "accountant", accountant) as Uint8Array);
    check(view.amount === note.amount && view.box === note.box && view.asset === "USDC", `accountant sees the bookkeeping fields of output ${j}`);
    const owned = openOwnerNote(splitTx.ciphertext, j as 0 | 1, ownerView, noteCommitment(note));
    check(owned !== undefined && owned.note.salt === note.salt, `owner opens output ${j} of the split from its envelope`);
    const epk = envelopeEpk(splitTx.ciphertext);
    const partials = [authority.shares[0], authority.shares[2]].map((share) => partialDecrypt(epk, share as never));
    const authorityView = decodeAuthorityPayload(openSection(splitTx.ciphertext, j as 0 | 1, "authority", { publicKey: authority.publicKey, sharedSecret: combinePartials(partials) }) as Uint8Array);
    check(authorityView.amount === note.amount, `two authority shares open output ${j}`);
    const oneShare = openSection(splitTx.ciphertext, j as 0 | 1, "authority", { publicKey: authority.publicKey, sharedSecret: combinePartials([partialDecrypt(epk, authority.shares[1] as never)]) });
    check(oneShare === undefined, `a single authority share opens nothing for output ${j}`);
  }
  check(openSection(lastTx.ciphertext, 0, "accountant", accountant) === undefined, "after revocation the old accountant key finds nothing in the new envelope");
  check(openSection(splitTx.ciphertext, 0, "accountant", accountant) !== undefined, "the revoked accountant still reads what was sealed before the revocation");
  console.log("viewing tiers verified on-chain data: owner, accountant, threshold authority, revocation");

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
