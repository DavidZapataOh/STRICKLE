import { expect, type BrowserContext, type Page } from "@playwright/test";
import { http, type Address, createPublicClient } from "viem";
import { networks } from "@strickle/arc/networks";
import { factoryAbi } from "../../src/chain/abi.ts";
import { deploymentsFor } from "../../src/config/network.ts";

const chain = createPublicClient({ transport: http(networks.testnet.rpcUrl) });
const deployed = deploymentsFor("testnet");

export const liveEnabled = Boolean(process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY) && process.env.RUN_LIVE === "1";
export const SKIP_REASON = "a live run needs RUN_LIVE=1 and the Circle testnet client key";

export async function addVirtualAuthenticator(page: Page, context: BrowserContext): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
}

/** A brand-new user walks the whole flow with a virtual passkey: the flat-estimate path (Nigeria), 3,200 a month, a 2,000 salary. Ends on the done screen. */
export async function completeOnboarding(page: Page, context: BrowserContext): Promise<{ owner: Address; vault: Address; username: string; code: string }> {
  await addVirtualAuthenticator(page, context);
  await page.goto("/en/start?amount=3200&country=NG&goal=2000", { waitUntil: "networkidle" });
  await page.getByRole("radio").first().check(); // digital dollars
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox").selectOption("NG");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // income, prefilled by the landing link
  await page.getByRole("button", { name: "Continue" }).click(); // history
  await expect(page.getByText("a flat estimate until your regime is confirmed")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create my account" }).click();
  const username = `strickle-${Date.now()}`;
  await page.getByLabel("Choose a name for your passkey").fill(username);
  await page.getByRole("button", { name: "Create account with a passkey" }).click();

  // the recovery code comes before anything is sent: read it back as a user would, and confirm two groups
  await expect(page.getByRole("heading", { name: "Save your recovery code" })).toBeVisible({ timeout: 120_000 });
  const groups = await page.locator(".recovery-group").allTextContents();
  expect(groups).toHaveLength(11);
  await page.getByLabel("Group 3").fill(groups[2] as string);
  await page.getByLabel("Group 8").fill(groups[7] as string);
  await page.getByRole("button", { name: "I saved it, continue" }).click();

  await expect(page.getByRole("heading", { name: "Your boxes are ready" })).toBeVisible({ timeout: 300_000 });
  const owner = (await page.getByTestId("account-address").textContent()) as Address;
  const vault = await chain.readContract({ address: deployed.BoxVaultFactory, abi: factoryAbi, functionName: "vaultOf", args: [owner] });
  return { owner, vault, username, code: groups.join("-") };
}
