import { expect, test } from "@playwright/test";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { connect } from "@strickle/db/connect";
import { createInvoice } from "@strickle/db/payments";
import { WIDGET_FRAME_ORIGINS } from "../../src/payments/card-headers.ts";

const enabled = process.env.RUN_LIVE === "1" && Boolean(process.env.ONRAMP_API_KEY) && Boolean(process.env.DATABASE_URL) && Boolean(process.env.INVOICE_SECRET);
test.skip(!enabled, "needs RUN_LIVE=1, ONRAMP_API_KEY, DATABASE_URL and INVOICE_SECRET, with the app running under the same variables");

const VAULT = (process.env.E2E_VAULT ?? "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8") as `0x${string}`;

// Mints a real sandbox session and loads the hosted widget under the page's own headers. Completing the purchase inside the widget is the owner's manual step (dummy data only), run with HEADED=1.
test("the card widget loads under the payer page's headers, with no policy violation and no frame the list lacks", async ({ page }) => {
  test.setTimeout(600_000);
  const sql = connect(process.env.DATABASE_URL as string);
  const invoice = await createInvoice(sql, invoiceKeys(process.env.INVOICE_SECRET as string), { vault: VAULT, label: "Card sandbox", payeeName: "Sandbox", note: "", amount: 5_000_000n, expiresAt: new Date(Date.now() + 86_400_000) });
  await sql.end();

  const violations: string[] = [];
  page.on("pageerror", (error) => console.error("page error:", error.message.slice(0, 300)));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("console error:", message.text().slice(0, 300));
    if (/Content Security Policy|Permissions[- ]Policy|permissions policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto(`/en/pay/${invoice.token}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Pay with card" }).first().click();
  await page.waitForSelector('iframe[src*="onramp-sandbox.arc.io"]', { timeout: 60_000 });
  await page.waitForTimeout(10_000);

  const origins = [...new Set(page.frames().map((frame) => frame.url()).filter((url) => url.startsWith("http")).map((url) => new URL(url).origin))].filter((origin) => origin !== new URL(page.url()).origin);
  console.error("frame origins the widget embeds", JSON.stringify(origins));
  for (const origin of origins) expect(WIDGET_FRAME_ORIGINS.sandbox, `add ${origin} to WIDGET_FRAME_ORIGINS`).toContain(origin);
  expect(violations).toEqual([]);

  if (process.env.HEADED === "1") await page.pause();
});
