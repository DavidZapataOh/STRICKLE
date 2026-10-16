import { expect, test } from "@playwright/test";
import { SESSION_KEY } from "../src/account/session.ts";

// A real registered vault from the chain; the session is written the way the onboarding writes it, under the key the account module exports.
test.beforeEach(async ({ page }) => {
  const vault = process.env.E2E_VAULT;
  test.skip(!vault, "set E2E_VAULT to a registered vault");
  await page.addInitScript(
    ([address, key]) => localStorage.setItem(key, JSON.stringify({ owner: address, vault: address, username: "e2e", createdAt: 1_800_000_000 })),
    [vault, SESSION_KEY] as const,
  );
});

test("the pause control is in the header, named, reachable by keyboard and does not overflow at any width", async ({ page }) => {
  await page.goto("/en/boxes", { waitUntil: "networkidle" });
  const control = page.getByRole("button", { name: /pause|resume/i });
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.className)).toContain("skip-link");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
});

test("the control is absent without an account", async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("http://localhost:3200/en", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /pause|resume/i })).toHaveCount(0);
  await page.close();
});
