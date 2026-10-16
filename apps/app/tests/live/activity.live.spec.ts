import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { SESSION_KEY } from "../../src/account/session.ts";
import { SKIP_REASON, addVirtualAuthenticator, completeOnboarding, liveEnabled } from "./support.ts";

const STATE = "/private/tmp/claude-501/activity-live.json";
const phase = process.env.LIVE_PHASE; // "onboard" on day one, "approve" at least a day later

test.skip(!liveEnabled || !phase, `${SKIP_REASON}, and LIVE_PHASE=onboard or LIVE_PHASE=approve`);

test("day one: onboard with a fresh passkey and set the payday to tomorrow", async ({ page, context }) => {
  test.skip(phase !== "onboard");
  test.setTimeout(900_000);
  const tomorrow = new Date(Date.now() + 86_400_000).getUTCDate();
  expect(tomorrow, "run on a day whose tomorrow is the 1st to the 28th of a month").toBeLessThanOrEqual(28);
  const { owner, vault, username, code, authenticatorId } = await completeOnboarding(page, context, { payday: tomorrow });
  const cdp = await context.newCDPSession(page);
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  const session = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null"), SESSION_KEY);
  expect(session?.vault.toLowerCase()).toBe(vault.toLowerCase());
  writeFileSync(STATE, JSON.stringify({ owner, vault, username, code, credentials, session, onboardedAt: Date.now() }));
  console.log(`onboarded ${owner}, vault ${vault}; fund it, then run the second sitting on payday`);
});

test("day two: the agent proposes the salary, the user approves it with the passkey, the decision and the receipt appear", async ({ page, context, request }) => {
  test.skip(phase !== "approve");
  test.setTimeout(1_200_000);
  const saved = JSON.parse(readFileSync(STATE, "utf8"));
  expect(Date.now() - saved.onboardedAt, "the payee approval needs a full day").toBeGreaterThan(86_400_000);
  // a virtual authenticator lives and dies with its browser context: replay the credentials created on day one
  const authenticatorId = await addVirtualAuthenticator(page, context);
  const cdp = await context.newCDPSession(page);
  for (const credential of saved.credentials) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
  await page.addInitScript(([key, session]) => window.localStorage.setItem(key as string, JSON.stringify(session)), [SESSION_KEY, saved.session]);

  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|connect|execute)/i.test(message.text())) violations.push(message.text());
  });

  await page.goto("/en/activity", { waitUntil: "networkidle" });
  await page.getByLabel("Recovery code").fill(saved.code.toLowerCase().replaceAll("-", " "));
  await page.getByRole("button", { name: "Restore" }).click();

  const card = page.locator(".proposal").first();
  await expect(card).toBeVisible({ timeout: 900_000 });
  await expect(card.getByText("US$")).toBeVisible();
  const startedAt = Date.now();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByText("Done. The receipt is below")).toBeVisible({ timeout: 300_000 });
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  await expect(page.locator(".strip", { hasText: /salary/i }).first()).toBeVisible({ timeout: 60_000 });
  console.log(`approved and confirmed in ${seconds} seconds`);

  // the relay refuses what it should, against the real chain and database
  const forged = { vault: "0x00000000000000000000000000000000000000a1", sealed: `0x${"ab".repeat(80)}` };
  const refused = await request.post("/api/agent-action", { data: forged, headers: { origin: new URL(page.url()).origin } });
  expect([404, 429]).toContain(refused.status());
  expect((await request.post("/api/agent-action", { data: forged })).status()).toBe(400);
  expect(violations).toEqual([]);

  for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440], [1280, 720], [844, 390]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `/private/tmp/claude-501/activity-${width}x${height}.png`, fullPage: true });
  }
});
