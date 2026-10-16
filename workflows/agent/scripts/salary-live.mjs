// workflows/agent/scripts/salary-live.mjs
import { addDays, allocatePayment, formatPlainDate, money } from "@strickle/core";
import { getAddress } from "viem";
import { decryptState, parseMaster } from "../enclave/keys.ts";
import { decodeProfile } from "../enclave/profile.ts";
import { abi, context, readState, salaryOffset, submitProfile, waitFor } from "./live-support.mjs";

const USDC = 1;
const SALARY = 3;
const ctx = await context();
const { publicClient, contracts, vault, owner, call, circle, network } = ctx;
const executor = contracts.AgentExecutor.address;
const read = (functionName, args) => publicClient.readContract({ address: vault, abi: abi.vault, functionName, args });

// the owner approves themselves as salary payee; a new approval takes the vault's own delay (one day) to apply
const approvalAbi = [
  { type: "function", name: "approveRecipient", stateMutability: "nonpayable", inputs: [{ type: "uint8" }, { type: "address" }], outputs: [] },
  { type: "function", name: "isApproved", stateMutability: "view", inputs: [{ type: "uint8" }, { type: "address" }], outputs: [{ type: "bool" }] },
];
await call(vault, approvalAbi, "approveRecipient", [SALARY, owner]);
if (!(await publicClient.readContract({ address: vault, abi: approvalAbi, functionName: "isApproved", args: [SALARY, owner] }))) {
  throw new Error("the salary payee is not approved yet: the vault applies a new approval after its delay; run this again tomorrow");
}

if (!(await publicClient.readContract({ address: executor, abi: abi.executor, functionName: "registered", args: [vault] }))) await call(executor, abi.executor, "register", [vault]);
await call(vault, abi.vault, "setAgent", [executor, 100_000_000n, 86_400]);

// the sandbox clock: the agent's day starts the day before a first of the month, so the deposit is split before salary day arrives
const { offset, today } = await salaryOffset(ctx);
const history = Array.from({ length: 8 }, (_, i) => [formatPlainDate(addDays(today, -7 * (i + 1))), "500000000", "deposit"]);
const profile = {
  version: 1, taxRateBps: 0, taxBufferBps: 10500, payrollShareBps: 10000, floorDays: 14, targetDays: 42,
  dailySpend: "20000", payrollDue: "0", salaryOwed: "1000000", emergencyTarget: "0",
  salary: { proposed: "1000000", pending: "0", payee: owner, day: 1, lastPaid: "" },
  limits: { dailyCap: "100000000", signatureThreshold: "100000000" },
  history, clockOffsetDays: offset - 1,
};
await submitProfile(ctx, profile);

const before = { salary: await read("boxBalance", [USDC, SALARY]) };
const funded = await circle.createTransaction({ blockchain: network.circleBlockchain, walletAddress: owner, destinationAddress: vault, tokenAddress: network.usdc, amount: ["2"], fee: { type: "level", config: { feeLevel: "MEDIUM" } } });
await waitFor(async () => (await circle.getTransaction({ id: funded.data.id })).data.transaction.state === "COMPLETE", "the deposit to land");
await waitFor(async () => (await read("unallocated", [USDC])) === 0n, "the agent to split the deposit", 420);
const expected = allocatePayment(money("USDC", 2_000_000n), {
  asset: "USDC", taxRateBps: 0, taxBufferBps: 10500, payrollDue: 0n, payrollFunded: 0n, payrollShareBps: 10000, dailySpend: 20000n,
  operatingBalance: 0n, floorDays: 14, targetDays: 42, salaryOwed: 1_000_000n, emergencyTarget: 0n, emergencyBalance: 0n,
});
const salaryFunded = await read("boxBalance", [USDC, SALARY]);
if (salaryFunded - before.salary !== expected.byBox.salary.units) throw new Error(`the salary box got ${salaryFunded - before.salary}, the cascade says ${expected.byBox.salary.units}`);

// now salary day arrives: the clock moves to the first, the agent's own fields stay
await submitProfile(ctx, { ...profile, clockOffsetDays: offset });
const monthKey = formatPlainDate(today).slice(0, 7);
await waitFor(async () => {
  const state = await readState(ctx);
  const opened = decodeProfile(decryptState(parseMaster(process.env.AGENT_MASTER_VALUE), getAddress(vault), state.version, state.ciphertext));
  return opened.salary.lastPaid === monthKey;
}, "the daily tick to pay the salary", 900);

const after = await readState(ctx);
const final = decodeProfile(decryptState(parseMaster(process.env.AGENT_MASTER_VALUE), getAddress(vault), after.version, after.ciphertext));
if ((await read("boxBalance", [USDC, SALARY])) !== salaryFunded - 1_000_000n) throw new Error("the salary box did not pay out exactly the salary");
if (final.salary.pending !== "0") throw new Error(`the salary should be fully paid, ${final.salary.pending} is still pending`);
if (final.tick.lastDay !== formatPlainDate(today)) throw new Error("the daily tick did not stamp the agent's day");
if (!/^-?[0-9]+$/.test(final.tick.p50)) throw new Error("the forecast was not refreshed");

await call(vault, abi.vault, "revokeAgent", []);
for (const box of [4, 6]) {
  const balance = await read("boxBalance", [USDC, box]);
  if (balance > 0n) await call(vault, abi.vault, "withdraw", [USDC, box, balance, owner]);
}
console.log(`salary day ${formatPlainDate(today)} (offset ${offset} days): paid 1000000 to the payee, pending ${final.salary.pending}, forecast p10 ${final.tick.p10} p50 ${final.tick.p50}, funds returned`);
