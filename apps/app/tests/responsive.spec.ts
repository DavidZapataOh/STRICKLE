import { expect, test } from "@playwright/test";
import { responsiveSuite } from "@strickle/gates";

const locales = ["en", "es", "pt-br"];
const screens = ["", "/activity", "/boxes", "/settings", "/verify", "/docs"];

responsiveSuite(locales.flatMap((locale) => screens.map((screen) => `/${locale}${screen}`)));

test("the tab bar never covers the content on a phone", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 1024, "the side menu replaces the tab bar");
  await page.goto("/pt-br/boxes", { waitUntil: "networkidle" });
  const nav = await page.locator(".shell-nav").boundingBox();
  const last = await page.locator(".shell-main > *:last-child").boundingBox();
  expect(nav).not.toBeNull();
  expect(last).not.toBeNull();
  await page.locator(".shell-main > *:last-child").scrollIntoViewIfNeeded();
  const after = await page.locator(".shell-main > *:last-child").boundingBox();
  expect((after?.y ?? 0) + (after?.height ?? 0)).toBeLessThanOrEqual((nav?.y ?? 0) + 1);
});

test("the tab order is skip link, brand, then the four destinations in order", async ({ page }) => {
  await page.goto("/en", { waitUntil: "networkidle" });
  const focused = () => page.evaluate(() => `${document.activeElement?.className ?? ""}|${document.activeElement?.textContent?.trim() ?? ""}`);
  await page.keyboard.press("Tab");
  expect(await focused()).toContain("skip-link");
  await page.keyboard.press("Tab");
  expect(await focused()).toContain("brand");
  for (const label of ["Home", "Activity", "Boxes", "Settings"]) {
    await page.keyboard.press("Tab");
    expect(await focused()).toBe(`nav-item|${label}`);
  }
});

test("the response carries the security headers", async ({ request, viewport }) => {
  test.skip(viewport?.width !== 1280 || viewport?.height !== 800, "headers do not depend on the viewport: one project is enough");
  const response = await request.get("/en");
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("unsafe-eval");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("an API path is not sent to a locale", async ({ request, viewport }) => {
  test.skip(viewport?.width !== 1280 || viewport?.height !== 800, "routing does not depend on the viewport: one project is enough");
  const response = await request.get("/api/does-not-exist", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
