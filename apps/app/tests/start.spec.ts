import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";

const next = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /^(Continue|Continuar)$/ }).click();

test("every question of the flow fits, in every language", async ({ page }) => {
  for (const lang of ["en", "es", "pt-br"]) {
    await page.goto(`/${lang}/start?amount=3200&country=NG&goal=2000`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    expect(await audit(page)).toEqual([]);
    await page.getByRole("radio").first().check();
    await next(page);
    expect(await audit(page)).toEqual([]);
    await page.getByRole("combobox").selectOption("NG");
    await next(page);
    expect(await audit(page)).toEqual([]); // income, prefilled by the landing link
    await next(page);
    expect(await audit(page)).toEqual([]); // history
    await next(page);
    await expect(page.getByRole("checkbox")).toBeVisible(); // review waits for the diagnosis
    expect(await audit(page)).toEqual([]);
  }
});

test("the account step fits, in every language", async ({ page }) => {
  for (const lang of ["en", "es", "pt-br"]) {
    await page.goto(`/${lang}/start?mode=login`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByLabel(/passkey/i)).toBeVisible();
    expect(await audit(page)).toEqual([]);
  }
});

test("a landing link with garbage still opens an empty first step", async ({ page }) => {
  await page.goto("/en/start?amount=-5&country=ZZ&goal=abc", { waitUntil: "networkidle" });
  await expect(page.getByRole("radio").first()).not.toBeChecked();
});

test("the landing's own link ends up in the flow, in the landing's language, with its values", async ({ page }) => {
  await page.goto("/?amount=3200&country=MX&goal=2000&lang=es", { waitUntil: "networkidle" });
  const url = new URL(page.url());
  expect(url.pathname).toBe("/es/start");
  expect(url.searchParams.get("country")).toBe("MX");
});

test("changing the country does not keep the regime chosen for the old one", async ({ page }) => {
  await page.goto("/en/start", { waitUntil: "networkidle" });
  await page.getByRole("radio").first().check();
  await next(page);
  await page.getByRole("combobox").selectOption("MX");
  await next(page);
  await page.getByRole("radio").first().check(); // the coded regime
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("combobox").selectOption("BR");
  await next(page);
  await expect(page.getByRole("radio").first()).not.toBeChecked();
});

test("a number typed with the language's own separator is understood", async ({ page }) => {
  await page.goto("/pt-br/start?amount=3200&country=NG&goal=2000", { waitUntil: "networkidle" });
  await page.getByRole("radio").first().check();
  await next(page);
  await page.getByRole("combobox").selectOption("NG");
  await next(page);
  await page.getByLabel(/Renda mensal/).fill("3.200");
  await next(page);
  await expect(page.getByRole("heading", { name: "Seus pagamentos habituais" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar" }).click();
  await page.getByLabel(/Renda mensal/).fill("3,5");
  await next(page);
  await expect(page.locator(".field-error[role=alert]")).toBeVisible();
});

test("the test network is always announced", async ({ page }) => {
  await page.goto("/en/start", { waitUntil: "networkidle" });
  await expect(page.getByText("Test network")).toBeVisible();
});
