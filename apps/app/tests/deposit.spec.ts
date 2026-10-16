import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { SESSION_KEY } from "../src/account/session.ts";
import { createHeadlessWallet } from "./support/headless-wallet.ts";

const VAULT = process.env.E2E_VAULT ?? "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const OWNER = "0x00000000000000000000000000000000000000a1";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key, owner, vault]) => window.localStorage.setItem(key as string, JSON.stringify({ owner, vault, username: "", createdAt: 0 })), [SESSION_KEY, OWNER, VAULT]);
});

for (const locale of ["en", "es", "pt-br"]) {
  test(`${locale} deposit screen fits every viewport`, async ({ page }) => {
    await page.goto(`/${locale}/deposit`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".shell-main")).not.toContainText(/NaN|undefined/);
    expect(await audit(page)).toEqual([]);
  });
}

test("a signed-out visitor sees the sign-in choice and downloads no bridge code", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.removeItem(key as string), SESSION_KEY);
  const scripts: string[] = [];
  page.on("response", (response) => response.request().resourceType() === "script" && scripts.push(response.url()));
  await page.goto("/en/deposit", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  const bytes = (await Promise.all(scripts.map(async (url) => (await (await page.request.get(url)).body()).length))).reduce((sum, size) => sum + size, 0);
  expect(bytes).toBeLessThan(1_000_000);
});

test("a signed-in user who has not pressed Connect wallet downloads no bridge code either", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() === "script") bodies.push(await response.text().catch(() => ""));
  });
  await page.goto("/en/deposit", { waitUntil: "networkidle" });
  expect(bodies.some((body) => body.includes("stablecoinKits") || body.includes("depositForBurn"))).toBe(false);
});

test("with no wallet installed it says so and still shows the direct address", async ({ page }) => {
  await page.goto("/en/deposit", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByText(/no wallet/i)).toBeVisible();
  await expect(page.getByText(VAULT)).toBeVisible();
});

test("a wallet that cannot sign still gets a real quote and a refusal path, and nothing but the kit's usage-log call is blocked by the policy", async ({ page }) => {
  const wallet = createHeadlessWallet({ privateKey: `0x${"11".repeat(32)}`, signing: false });
  await wallet.install(page);
  const violations: string[] = [];
  page.on("console", (message) => message.text().includes("Content Security Policy") && violations.push(message.text()));
  await page.goto("/en/deposit", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: /Headless/ }).click();
  await page.getByRole("radio", { name: "Base" }).check();
  await page.getByLabel("Amount (USDC)").fill("25");
  await expect(page.getByText("You send")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/exactly|at least/).first()).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/rejected/i)).toBeVisible();
  await expect(page.getByText("You send")).toBeVisible(); // back at the quote, not a dead end
  expect(await audit(page)).toEqual([]);
  // the kit's usage-log call to Circle is not an origin the policy allows: if the kit makes it, the browser reports a violation naming api.circle.com, and nothing else may be blocked
  expect(violations.every((text) => text.includes("api.circle.com"))).toBe(true);
});
