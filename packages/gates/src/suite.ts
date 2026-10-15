import { expect, test } from "@playwright/test";
import { type AuditOptions, audit } from "./audit.ts";
import { VIEWPORTS } from "./viewports.ts";

export const viewportProjects = VIEWPORTS.map(({ name, width, height }) => ({
  name,
  use: { viewport: { width, height } },
}));

export function responsiveSuite(routes: readonly string[], options: AuditOptions = {}): void {
  for (const route of routes) {
    test(`${route} fits the viewport`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      expect(await audit(page, options)).toEqual([]);
    });
  }
}
