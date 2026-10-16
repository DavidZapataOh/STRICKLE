import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { SKIP_REASON, liveEnabled } from "./support.ts";

test.skip(!liveEnabled, SKIP_REASON);

// accountant-live-prepare.mjs shields one real USDC as a payroll note sealed for the owner and for the accountant key it saves.
test("an accountant key opens exactly one real shielded note", async ({ page }) => {
  test.setTimeout(900_000);
  execFileSync("node", ["--env-file=/Users/david/tameion/.env", "scripts/accountant-live-prepare.mjs"], { stdio: "inherit" });
  const saved = JSON.parse(readFileSync("/private/tmp/claude-501/accountant-live.json", "utf8")) as { secret: string; amount: string; box: string };

  await page.goto("/en/accountant", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "I already have a key" }).click();
  await page.getByLabel("Key (64 characters)").fill(saved.secret);
  await page.getByRole("button", { name: "Use this key" }).click();
  await expect(page.getByRole("heading", { name: "Notes shared with this key" })).toBeVisible();
  await expect(page.getByText("US$1.00")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Payroll")).toBeVisible();
  await expect(page.locator(".row")).toHaveCount(1);

  // a different key sees the empty state, not a partial view
  await page.getByRole("button", { name: "Forget this key" }).click();
  await page.getByRole("button", { name: "Create a view key" }).click();
  await expect(page.getByText("No private notes have been shared with this key yet.")).toBeVisible({ timeout: 120_000 });
});
