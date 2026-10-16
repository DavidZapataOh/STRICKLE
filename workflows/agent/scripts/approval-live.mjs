// workflows/agent/scripts/approval-live.mjs
import { addDays, formatPlainDate } from "@strickle/core";
import { generateProverKey } from "@strickle/prover/sealed";
import { getAddress, parseAbiItem } from "viem";
import { decryptState, parseMaster } from "../enclave/keys.ts";
import { openNotice } from "../enclave/notices.ts";
import { decodeProfile } from "../enclave/profile.ts";
import { triggerWorkflow } from "./gateway.mjs";
import { abi, context, readState, salaryOffset, sealRequest, signAction, submitProfile, waitFor } from "./live-support.mjs";

const USDC = 1;
const SALARY = 3;
const GATEWAY = process.env.CRE_GATEWAY_URL ?? "https://01.gateway.zone-a.cre.chain.link";
const workflowId = process.argv[2];
if (!/^(0x)?[0-9a-f]{64}$/.test(workflowId ?? "")) throw new Error("usage: approval-live.mjs <workflow id>");

const ctx = await context();
const { publicClient, contracts, vault, owner, circle, network, call } = ctx;
const executor = contracts.AgentExecutor.address;
const stateAddress = contracts.AgentState.address;
const read = (functionName, args) => publicClient.readContract({ address: vault, abi: abi.vault, functionName, args });
const notices = parseAbiItem("event Notice(address indexed vault, uint64 indexed id, bytes sealedData)");
const master = parseMaster(process.env.AGENT_MASTER_VALUE);
const state = async () => {
  const s = await readState(ctx);
  return { version: s.version, profile: decodeProfile(decryptState(master, getAddress(vault), s.version, s.ciphertext)) };
};
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// prerequisites shared with the salary proof: registered by the owner, delegated to the executor
if (!(await publicClient.readContract({ address: executor, abi: abi.executor, functionName: "registered", args: [vault] }))) await call(executor, abi.executor, "register", [vault]);
await call(vault, abi.vault, "setAgent", [executor, 100_000_000n, 86_400]);

const user = generateProverKey();
// the agent's day starts the day before a first of the month, so the deposit is split before salary day; the clock moves after
const { offset, today } = await salaryOffset(ctx);
const history = Array.from({ length: 8 }, (_, i) => [formatPlainDate(addDays(today, -7 * (i + 1))), "500000000", "deposit"]);
// a signature threshold of zero: every outflow waits for the owner, so salary day becomes a proposal
const profile = {
  version: 1, taxRateBps: 0, taxBufferBps: 10500, payrollShareBps: 10000, floorDays: 14, targetDays: 42,
  dailySpend: "20000", payrollDue: "0", salaryOwed: "1000000",
  salary: { proposed: "1000000", pending: "0", payee: owner, day: 1, lastPaid: "" },
  limits: { dailyCap: "100000000", signatureThreshold: "0" },
  history, clockOffsetDays: offset - 1, userKey: `0x${Buffer.from(user.publicKey).toString("hex")}`,
};
await submitProfile(ctx, profile);

const funded = await circle.createTransaction({ blockchain: network.circleBlockchain, walletAddress: owner, destinationAddress: vault, tokenAddress: network.usdc, amount: ["2"], fee: { type: "level", config: { feeLevel: "MEDIUM" } } });
await waitFor(async () => (await circle.getTransaction({ id: funded.data.id })).data.transaction.state === "COMPLETE", "the deposit to land");
await waitFor(async () => (await read("unallocated", [USDC])) === 0n, "the agent to split the deposit", 420);
const salaryBefore = await read("boxBalance", [USDC, SALARY]);
await submitProfile(ctx, { ...profile, clockOffsetDays: offset });

const readNotices = async () => {
  const logs = await publicClient.getLogs({ address: stateAddress, event: notices, args: { vault }, fromBlock: 0n });
  return logs.map((log) => ({ id: log.args.id, notice: openNotice(user.secret, user.publicKey, getAddress(vault), log.args.id, Buffer.from(log.args.sealedData.slice(2), "hex")) })).filter((entry) => entry.notice);
};
let proposal;
await waitFor(async () => {
  proposal = (await readNotices()).map((entry) => entry.notice).find((notice) => notice.kind === "proposal");
  return proposal !== undefined;
}, "the daily tick to propose the salary", 900);
if ((await read("boxBalance", [USDC, SALARY])) !== salaryBefore) throw new Error("the salary moved before the owner signed");

// the trigger takes one request per 30 seconds, so every send is followed by a pause and must itself be accepted by the gateway
const send = async (action, nonce, deadline, signature) => {
  const answer = await triggerWorkflow({ url: GATEWAY, workflowId, privateKey: process.env.CRE_GATEWAY_KEY, input: await sealRequest(ctx, { vault, action, nonce: String(nonce), deadline, signature }) });
  if (answer.result?.status !== "ACCEPTED") throw new Error(`the gateway did not accept a request: ${JSON.stringify(answer)}`);
  await settle(35_000);
};

const approve = { kind: "approve", proposalId: proposal.proposalId, digest: proposal.digest };
const deadline = Math.floor(Date.now() / 1000) + 580;
const goodSignature = await signAction(ctx, approve, 1, deadline);
const before = await state();
// flip a byte inside r: changing only the recovery id could still verify, because the fallback path normalises it
const tampered = `0x${goodSignature.slice(2, 4) === "ff" ? "00" : "ff"}${goodSignature.slice(4)}`;
const past = Math.floor(Date.now() / 1000) - 10;
await send(approve, 1, deadline, tampered);
await send(approve, 1, past, await signAction(ctx, approve, 1, past));
await send({ ...approve, digest: `0x${"cd".repeat(32)}` }, 1, deadline, goodSignature);
await settle(45_000); // the last refusal is processed asynchronously: give it time to (wrongly) change something
if ((await state()).version !== before.version || (await read("boxBalance", [USDC, SALARY])) !== salaryBefore) throw new Error("a refused request changed the vault or the state");

// the real approval, then the same request again
await send(approve, 1, deadline, goodSignature);
await waitFor(async () => (await read("boxBalance", [USDC, SALARY])) === salaryBefore - 1_000_000n, "the approved salary to be paid", 300);
const after = await state();
if (after.profile.proposals[0].status !== "executed" || after.profile.nonce !== "1") throw new Error("the proposal was not consumed or the nonce not recorded");
await send(approve, 1, deadline, goodSignature);
await settle(45_000);
if ((await state()).version !== after.version) throw new Error("a replayed approval changed the state");
const seen = (await readNotices()).map((entry) => entry.notice.kind);
if (!seen.includes("decision") || !seen.includes("salary")) throw new Error(`the user was not told: ${seen.join(", ")}`);

await call(vault, abi.vault, "revokeAgent", []);
for (const box of [4, 6]) {
  const balance = await read("boxBalance", [USDC, box]);
  if (balance > 0n) await call(vault, abi.vault, "withdraw", [USDC, box, balance, owner]);
}
console.log(`signed approval executed: salary paid, proposal consumed, ${seen.length} notices opened by the user, 3 refusals and 1 replay changed nothing`);
