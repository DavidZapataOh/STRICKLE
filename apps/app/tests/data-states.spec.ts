import { readFileSync } from "node:fs";
import { join } from "node:path";
import { audit } from "@strickle/gates";
import { expect, test } from "@playwright/test";
import { SESSION_KEY } from "../src/account/session.ts";

// The shared test vault: created by the current factory and holding real payments.
const VAULT = process.env.E2E_VAULT ?? "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const OWNER = "0x00000000000000000000000000000000000000a1";
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

test.describe("signed in, on a device that holds no reading key", () => {
  // Layout checks use the explorer's real answers for the shared vault (captured by scripts/capture-fixtures.mjs): the public explorer is rate limited in CI.
  // The chain reads in these tests are not replaced, and the live proof exercises the real route end to end.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(([key, owner, vault]) => window.localStorage.setItem(key as string, JSON.stringify({ owner, vault, username: "", createdAt: 0 })), [SESSION_KEY, OWNER, VAULT]);
    await page.route(/\/api\/logs\?/, async (route) => {
      const kind = new URL(route.request().url()).searchParams.get("kind");
      await route.fulfill({ json: kind === "allocated" ? fixture("allocated.json") : kind === "split" ? fixture("split.json") : kind === "private-spend" ? fixture("private-spend.json") : { logs: [], truncated: false } });
    });
  });

  for (const locale of ["en", "es", "pt-br"]) {
    for (const screen of ["", "/boxes", "/activity", "/settings"]) {
      test(`${locale}${screen || "/"} fits every viewport`, async ({ page }) => {
        await page.goto(`/${locale}${screen}`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator(".shell-main")).not.toContainText(/NaN|undefined/);
        expect(await audit(page)).toEqual([]);
      });
    }
  }

  test("Boxes shows six boxes and a payment split from the vault's real history", async ({ page }) => {
    await page.goto("/en/boxes", { waitUntil: "networkidle" });
    await expect(page.locator(".box-row")).toHaveCount(6);
    await expect(page.locator(".payment").first()).toBeVisible();
    await expect(page.locator(".payment .split-bar").first()).toBeVisible();
  });

  test("Activity shows the vault's real private payment as a receipt and offers the key restore when the device has no key", async ({ page }) => {
    await page.goto("/en/activity", { waitUntil: "networkidle" });
    // the pool's Spent event is read from the real receipt of that transaction on the network
    await expect(page.locator(".strip").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".strip .strip-link").first()).toHaveAttribute("href", /\/tx\/0x[0-9a-f]{64}$/);
    await expect(page.getByText("This device cannot read your agent's notices")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
    await expect(page.locator(".strip").first()).not.toContainText(/NaN|undefined/);
  });

  test("Settings shows the vault's own limits from the chain and says the plan cannot be read without a key", async ({ page }) => {
    await page.goto("/en/settings", { waitUntil: "networkidle" });
    await expect(page.getByText("This device cannot read your plan, so the agent's own settings are not shown.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "The agent" })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(/NaN|undefined/);
  });

  test("Home without a reading key says so and keeps the navigation", async ({ page }) => {
    await page.goto("/en", { waitUntil: "networkidle" });
    await expect(page.getByText("This device cannot read your plan")).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
  });
});

test("signed out, Home offers to create an account or sign in and nothing overflows", async ({ page }) => {
  await page.goto("/en", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  expect(await audit(page)).toEqual([]);
});
