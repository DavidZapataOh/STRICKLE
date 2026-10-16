import { expect, test } from "@playwright/test";

const vault = process.env.E2E_VAULT;

test("a vault page is public, labeled so and not indexed", async ({ page }) => {
  test.skip(!vault, "set E2E_VAULT to a registered vault");
  await page.goto(`/en/view/${vault}`, { waitUntil: "networkidle" });
  await expect(page.getByText(/everything on this page is public/i)).toBeVisible();
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
});

test("an address that is not an address is a 404", async ({ page }) => {
  const response = await page.goto("/en/view/not-an-address");
  expect(response?.status()).toBe(404);
});
