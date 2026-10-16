import { expect, test } from "@playwright/test";

// The responsive suite already covers /activity at every viewport and language; this file holds what is specific to a visitor without an account.
test("a visitor without an account is asked to sign in, not shown an empty history", async ({ page }) => {
  await page.goto("/en/activity", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with passkey" })).toBeVisible();
  await expect(page.getByText("What the agent did")).toHaveCount(0);
});

test("the sign-in button is reachable by keyboard right after the navigation", async ({ page }) => {
  await page.goto("/en/activity", { waitUntil: "networkidle" });
  const button = page.getByRole("button", { name: "Sign in with passkey" });
  await button.focus();
  await expect(button).toBeFocused();
});

test("a visitor without an account never downloads the chain or wallet code", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") scripts.push(response.url());
  });
  await page.goto("/en/activity", { waitUntil: "networkidle" });
  const sizes = await Promise.all(scripts.map(async (url) => (await (await page.request.get(url)).body()).length));
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(1_000_000);
  expect(scripts.some((url) => /viem|circle/i.test(url))).toBe(false);
});

test("the screen loads without a single Content Security Policy violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|connect|execute)/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => violations.push(error.message));
  await page.goto("/en/activity", { waitUntil: "networkidle" });
  expect(violations).toEqual([]);
});
