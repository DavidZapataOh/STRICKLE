import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";

// The signed-in states (with a session, without a reading key) are audited in data-states.spec.ts at every viewport.
test("settings signed out says so and fits the viewport", async ({ page }) => {
  await page.goto("/pt-br/settings", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText("Entre para ver e mudar como seu agente funciona.")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("a visitor without an account sees no pause control and downloads no wallet code", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") scripts.push(response.url());
  });
  await page.goto("/en/settings", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /pause|resume/i })).toHaveCount(0);
  const bytes = (await Promise.all(scripts.map(async (url) => (await (await page.request.get(url)).body()).length))).reduce((sum, size) => sum + size, 0);
  expect(bytes).toBeLessThan(1_000_000);
});
