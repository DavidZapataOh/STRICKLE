import { expect, test } from "@playwright/test";
import { http, type Address, type Hex, createPublicClient, decodeErrorResult, encodeFunctionData, parseAbi } from "viem";
import { networks, transferSponsored, walletsClient } from "@strickle/arc";
import { encodeSplitReport } from "../../../../workflows/agent/enclave/split-report.ts";
import { latestPlan } from "../../src/chain/plan.ts";
import { parseLogsResponse } from "../../src/chain/logs.ts";
import { deploymentsFor } from "../../src/config/network.ts";
import { noticeKeyFromSecret } from "../../src/keys/notice-key.ts";
import { decodeRecoveryCode } from "../../src/keys/recovery-code.ts";
import { SKIP_REASON, completeOnboarding, liveEnabled } from "./support.ts";

test.skip(!liveEnabled, SKIP_REASON);

const network = networks.testnet;
const chain = createPublicClient({ transport: http(network.rpcUrl) });
const deployed = deploymentsFor("testnet");
const vaultAbi = parseAbi([
  "function agentPaused() view returns (bool)",
  "function agentCap() view returns (uint128)",
  "function unallocated(uint8 asset) view returns (uint256)",
  "function rules(uint8 box) view returns (uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil)",
  "function ruleChanges(uint8 box) view returns ((uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil) rule, uint64 effectiveAt, bool open)",
]);
const receiverAbi = parseAbi(["function forwarder() view returns (address)", "function expectedWorkflowId() view returns (bytes32)", "function onReport(bytes metadata, bytes report)", "error NotDelegated()"]);
const read = <T>(vault: Address, functionName: string, args: readonly unknown[] = []) => chain.readContract({ address: vault, abi: vaultAbi, functionName, args } as never) as Promise<T>;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const until = async (what: string, check: () => Promise<boolean>, seconds: number) => {
  for (let waited = 0; waited < seconds; waited += 10) {
    if (await check()) return;
    await sleep(10_000);
  }
  throw new Error(`timed out waiting for ${what}`);
};

test("pause, settings and rules, proven against the chain with a brand-new passkey account", async ({ page, context, request }) => {
  test.setTimeout(3_000_000);
  const { vault, code } = await completeOnboarding(page, context);
  const secret = decodeRecoveryCode(code) as bigint;
  const key = noticeKeyFromSecret(secret);
  expect(key).toBeDefined();
  const evidence: Record<string, unknown> = { vault };
  const pauseControl = page.getByRole("button", { name: /^(pause|resume)/i });

  const newestPlan = async () => {
    const response = await request.get(`/api/logs?kind=notice&vault=${vault}`);
    const parsed = parseLogsResponse(await response.json());
    return latestPlan(parsed.logs, key as NonNullable<typeof key>, vault);
  };

  // 1. Pause halts the agent on the chain, with the workflow active
  await page.goto("/en", { waitUntil: "networkidle" });
  await page.screenshot({ path: "test-results/live/home-running.png", fullPage: true });
  await pauseControl.click();
  await expect(page.getByText("Agent paused")).toBeVisible({ timeout: 180_000 });
  expect(await read<boolean>(vault, "agentPaused")).toBe(true);
  await page.screenshot({ path: "test-results/live/home-paused.png", fullPage: true });

  const circle = walletsClient("testnet");
  const funder = (await circle.getWallet({ id: process.env.CIRCLE_GAS_STATION_SCA_WALLET_ID as string })).data?.wallet?.address as Address;
  await transferSponsored({ circle, network, walletAddress: funder, to: vault, token: network.usdc, amount: "1" });
  await sleep(6 * 60_000);
  expect(await read<bigint>(vault, "unallocated", [1])).toBe(1_000_000n);

  const [forwarder, workflowId] = await Promise.all([
    chain.readContract({ address: deployed.AgentExecutor, abi: receiverAbi, functionName: "forwarder" }),
    chain.readContract({ address: deployed.AgentExecutor, abi: receiverAbi, functionName: "expectedWorkflowId" }),
  ]);
  const metadata = `${workflowId}${"00".repeat(32)}` as Hex;
  const report = encodeSplitReport({ vault, asset: 1, seen: 0n, boxes: [4], amounts: [0n], next: 1n, ciphertext: "0x00" });
  const refused = await chain.call({ account: forwarder, to: deployed.AgentExecutor, data: encodeFunctionData({ abi: receiverAbi, functionName: "onReport", args: [metadata, report] }) }).catch((error: { data?: Hex; cause?: { data?: Hex } }) => error);
  const revertData = (refused as { data?: Hex; cause?: { data?: Hex } }).data ?? (refused as { cause?: { data?: Hex } }).cause?.data;
  expect(revertData && decodeErrorResult({ abi: receiverAbi, data: revertData }).errorName).toBe("NotDelegated");
  evidence.pausedDepositUnsplit = "1000000";
  evidence.notDelegatedRevert = revertData;

  // 7. while paused the agent's controls are disabled with the reason, the vault's own edits still work
  await page.goto("/en/settings", { waitUntil: "networkidle" });
  for (const label of ["How much the agent decides", "Amount each month", "Day of the month (1 to 28)"]) {
    await expect(page.locator(".edit-row", { hasText: label }).getByRole("button", { name: "Change" })).toBeDisabled();
  }
  await expect(page.getByText("The agent applies this change, so it can only be made while the agent is running.").first()).toBeVisible();

  // 2. a cap edit does not unpause
  const limits = page.locator(".edit-row", { hasText: "Maximum the agent can move" });
  await limits.getByRole("button", { name: "Change" }).click();
  await limits.getByLabel("Maximum the agent can move").fill("250");
  await limits.getByLabel("Every (hours)").fill("12");
  await limits.getByRole("button", { name: "Save" }).click();
  await until("the cap to change", async () => (await read<bigint>(vault, "agentCap")) === 250_000_000n, 180);
  expect(await read<boolean>(vault, "agentPaused")).toBe(true);

  // 3. resume restarts the agent: the earlier deposit is split
  await page.goto("/en", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^resume/i }).click();
  await until("the vault to resume", async () => !(await read<boolean>(vault, "agentPaused")), 180);
  await until("the agent to split the deposit", async () => (await read<bigint>(vault, "unallocated", [1])) === 0n, 300);

  // 4. a settings change is confirmed by the agent's own fresh plan
  await page.goto("/en/settings", { waitUntil: "networkidle" });
  const autonomy = page.locator(".edit-row", { hasText: "How much the agent decides" });
  await autonomy.getByRole("button", { name: "Change" }).click();
  await autonomy.getByLabel("Ask me before every salary payment").check();
  const startedAt = Date.now();
  await autonomy.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Done. This is now in force.").first()).toBeVisible({ timeout: 600_000 });
  evidence.settingsConfirmedSeconds = Math.round((Date.now() - startedAt) / 1000);
  expect((await newestPlan())?.settings.signatureThreshold).toBe("0");

  // 5. a stricter rule applies now, a looser one waits
  const operating = 4;
  const before = await read<readonly [number, boolean, boolean, bigint, bigint]>(vault, "rules", [operating]);
  const rules = page.locator(".rule-box").nth(operating - 1);
  await rules.locator("summary").click();
  await rules.getByLabel("Withdrawals wait (hours)").fill(String(Math.round(before[0] / 3600) + 48));
  await expect(rules.getByText("Stricter: applies now.")).toBeVisible();
  await rules.getByRole("button", { name: "Save" }).click();
  await until("the stricter rule", async () => (await read<readonly [number, boolean, boolean, bigint, bigint]>(vault, "rules", [operating]))[0] === before[0] + 48 * 3600, 180);
  await rules.locator("summary").click();
  await rules.getByLabel("Withdrawals wait (hours)").fill("0");
  await expect(rules.getByText(/Looser: waits \d+ h/)).toBeVisible();
  await rules.getByRole("button", { name: "Save" }).click();
  await until("the looser rule to be pending", async () => (await read<readonly [unknown, bigint, boolean]>(vault, "ruleChanges", [operating]))[2], 180);
  const change = await read<readonly [{ delay: number }, bigint, boolean]>(vault, "ruleChanges", [operating]);
  expect(Number(change[1])).toBeGreaterThan(Math.floor(Date.now() / 1000));
  expect((await read<readonly [number, boolean, boolean, bigint, bigint]>(vault, "rules", [operating]))[0]).toBe(before[0] + 48 * 3600);
  await expect(page.getByRole("button", { name: "Apply now" })).toHaveCount(0);
  evidence.looserRuleEffectiveAt = Number(change[1]);

  // 9. screenshots of the settings screen at the ten viewports
  for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440], [1280, 720], [844, 390]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/live/settings-${width}x${height}.png`, fullPage: true });
  }
  console.log(JSON.stringify(evidence));
});
