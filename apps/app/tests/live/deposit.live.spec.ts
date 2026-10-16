import { expect, test } from "@playwright/test";
import { http, createPublicClient, parseAbi } from "viem";
import { networks } from "@strickle/arc";
import { SKIP_REASON, completeOnboarding, liveEnabled } from "./support.ts";
import { createHeadlessWallet } from "../support/headless-wallet.ts";

const key = process.env.DEPOSIT_TEST_KEY as `0x${string}` | undefined;
test.skip(!liveEnabled || !key, `${SKIP_REASON}, and DEPOSIT_TEST_KEY funded on Base Sepolia`);

const arc = createPublicClient({ transport: http(networks.testnet.rpcUrl) });
const usdc = parseAbi(["function balanceOf(address) view returns (uint256)"]);

test("a new account receives 1 USDC from Base Sepolia, and the deposit resumes after a reload", async ({ page, context }) => {
  test.setTimeout(1_800_000);
  const { vault } = await completeOnboarding(page, context);
  const wallet = createHeadlessWallet({ privateKey: key as `0x${string}`, signing: true });
  await wallet.install(page);

  await page.goto("/en/deposit", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: /Headless/ }).click();
  await page.getByRole("radio", { name: "Base" }).check();
  await page.getByLabel("Amount (USDC)").fill("1");
  await expect(page.getByText("You send")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Confirm" }).click();

  // the burn hash is saved the moment it is known: a reload must pick the deposit up again
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("strickle.deposit.pending.v1")), { timeout: 300_000 }).not.toBeNull();
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.getByText("Arrived. Your agent splits it into your boxes")).toBeVisible({ timeout: 1_200_000 });
  // a brand-new vault: receive-exact means it holds exactly what was typed
  const balance = await arc.readContract({ address: networks.testnet.usdc, abi: usdc, functionName: "balanceOf", args: [vault] });
  expect(balance).toBeGreaterThanOrEqual(1_000_000n);
});
