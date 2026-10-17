import { expect, test } from "@playwright/test";
import { http, createPublicClient, parseAbiItem } from "viem";
import { networks } from "@strickle/arc";
import { agentDeploymentsFor } from "../../src/config/network.ts";
import { createHeadlessWallet } from "../support/headless-wallet.ts";
import { SKIP_REASON, completeOnboarding, liveEnabled } from "./support.ts";

const key = (process.env.PRIVATE_KEY ?? "") as `0x${string}`;
test.skip(!liveEnabled || process.env.RUN_PAY_LIVE !== "1" || !key, `${SKIP_REASON}, RUN_PAY_LIVE=1 and the shared deployer key as the payer`);

const chain = createPublicClient({ transport: http(networks.testnet.rpcUrl) });
const split = parseAbiItem("event Split(address indexed vault, uint8 indexed asset, uint256 amount)");

// A fresh passkey account signs in (the real ERC-1271 check of a Circle smart account), bills 0.05 USDC, and a second browser pays the link on Arc with a Memo.
test("a freelancer bills and a client pays on Arc, with a real passkey account", async ({ page, context, browser }) => {
  test.setTimeout(1_800_000);
  const { vault } = await completeOnboarding(page, context);

  await page.goto("/en/invoices", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sign to manage invoices" }).click();
  await page.getByLabel("What is it for?").fill("Live proof");
  await page.getByLabel("Name shown to your client").fill("Ana");
  await page.getByLabel("Amount in USDC").fill("0.05");
  await page.getByRole("button", { name: "Create invoice" }).click();
  const link = await page.getByLabel("Copy link").first().inputValue();
  expect(link).toMatch(/\/en\/pay\/[A-Za-z0-9_-]{22}$/);

  const payerContext = await browser.newContext();
  const payer = await payerContext.newPage();
  await createHeadlessWallet({ privateKey: key, signing: true }).install(payer);
  await payer.goto(link, { waitUntil: "domcontentloaded" });
  await expect(payer.getByText("Pay Ana")).toBeVisible();
  await payer.getByRole("button", { name: "Connect wallet" }).first().click();
  await payer.getByRole("button", { name: /Headless/ }).click();
  await expect(payer.getByText("Payment received.")).toBeVisible({ timeout: 240_000 });

  await expect.poll(async () => (await page.getByText("Paid", { exact: true }).count()) > 0, { timeout: 120_000 }).toBe(true);
  const executor = agentDeploymentsFor("testnet").AgentExecutor;
  await expect
    .poll(async () => (await chain.getLogs({ address: executor, event: split, args: { vault }, fromBlock: 0n })).length, { timeout: 300_000 })
    .toBeGreaterThan(0);
  await payerContext.close();
});
