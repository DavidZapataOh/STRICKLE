// workflows/agent/scripts/deposit-live.mjs
import { allocatePayment, money } from "@strickle/core";
import { getAddress } from "viem";
import { decryptState, parseMaster } from "../enclave/keys.ts";
import { decodeProfile } from "../enclave/profile.ts";
import { abi, context, readState, submitProfile, waitFor } from "./live-support.mjs";

const USDC = 1;
const OPERATING = 4;
const PROFIT = 6;
const ctx = await context();
const { publicClient, contracts, vault, owner, call, circle, network } = ctx;
const executor = contracts.AgentExecutor.address;
const read = (functionName, args) => publicClient.readContract({ address: vault, abi: abi.vault, functionName, args });

// zero tax, payroll, salary and emergency targets: the whole deposit lands in boxes the owner can withdraw at once
const profile = { version: 1, taxRateBps: 0, taxBufferBps: 10500, payrollShareBps: 10000, floorDays: 14, targetDays: 42, dailySpend: "20000", payrollDue: "0", salaryOwed: "0", emergencyTarget: "0" };
await submitProfile(ctx, profile);

if (!(await publicClient.readContract({ address: executor, abi: abi.executor, functionName: "registered", args: [vault] }))) await call(executor, abi.executor, "register", [vault]);
await call(vault, abi.vault, "setAgent", [executor, 100_000_000n, 86_400]);

const before = { operating: await read("boxBalance", [USDC, OPERATING]), profit: await read("boxBalance", [USDC, PROFIT]) };
const { version: versionBefore } = await readState(ctx);

const funded = await circle.createTransaction({ blockchain: network.circleBlockchain, walletAddress: owner, destinationAddress: vault, tokenAddress: network.usdc, amount: ["1"], fee: { type: "level", config: { feeLevel: "MEDIUM" } } });
await waitFor(async () => (await circle.getTransaction({ id: funded.data.id })).data.transaction.state === "COMPLETE", "the deposit to land");
await waitFor(async () => (await read("unallocated", [USDC])) === 0n, "the agent to split the deposit", 420);

const expected = allocatePayment(money("USDC", 1_000_000n), {
  asset: "USDC", taxRateBps: 0, taxBufferBps: 10500, payrollDue: 0n, payrollFunded: 0n, payrollShareBps: 10000, dailySpend: 20000n,
  operatingBalance: before.operating, floorDays: 14, targetDays: 42, salaryOwed: 0n, emergencyTarget: 0n, emergencyBalance: 0n,
});
const after = { operating: await read("boxBalance", [USDC, OPERATING]), profit: await read("boxBalance", [USDC, PROFIT]) };
if (after.operating - before.operating !== expected.byBox.operating.units) throw new Error(`operating moved ${after.operating - before.operating}, the cascade says ${expected.byBox.operating.units}`);
if (after.profit - before.profit !== expected.byBox.profit.units) throw new Error(`profit moved ${after.profit - before.profit}, the cascade says ${expected.byBox.profit.units}`);

const { version: versionAfter, ciphertext } = await readState(ctx);
if (versionAfter !== versionBefore + 1n) throw new Error("the state version did not advance with the split");
decodeProfile(decryptState(parseMaster(process.env.AGENT_MASTER_VALUE), getAddress(vault), versionAfter, ciphertext));

await call(vault, abi.vault, "revokeAgent", []);
for (const box of [OPERATING, PROFIT]) {
  const balance = await read("boxBalance", [USDC, box]);
  if (balance > 0n) await call(vault, abi.vault, "withdraw", [USDC, box, balance, owner]);
}
console.log(`deposit split: operating +${after.operating - before.operating}, profit +${after.profit - before.profit}, state v${versionAfter}, funds returned`);
