import type { Page } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/** Puts server-rendered markup in the page under the app's own stylesheet, so the audit measures production CSS on production components. */
export async function renderWithAppCss(page: Page, baseURL: string, element: ReactElement, lang = "en"): Promise<void> {
  await page.goto(`${baseURL}/${lang}`, { waitUntil: "networkidle" });
  const css = await page.evaluate(async () => {
    const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => (link as HTMLLinkElement).href);
    return (await Promise.all(hrefs.map((href) => fetch(href).then((response) => response.text())))).join("\n");
  });
  await page.setContent(`<!doctype html><html lang="${lang}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div class="shell"><main class="shell-main">${renderToStaticMarkup(element)}</main></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
}
