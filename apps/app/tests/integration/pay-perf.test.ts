import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import { migrate } from "@strickle/db";
import { invoiceKeys } from "@strickle/db/invoice-keys";
import { createInvoice } from "@strickle/db/payments";
import { createTestDatabase } from "@strickle/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { securityHeaders } from "../../src/security-headers.ts";

// Needs `npm run build` first. The server is the real production build on a database of its own.
const PORT = 3299;
const BASE = `http://localhost:${PORT}`;
const secret = randomBytes(32).toString("base64");
const keys = invoiceKeys(secret);
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let server: ChildProcess;
let token = "";

async function ready(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/en`)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("the production server did not start");
}

beforeAll(async () => {
  db = await createTestDatabase();
  await migrate(db.sql);
  const created = await createInvoice(db.sql, keys, { vault: `0x${"ab".repeat(20)}`, label: "Perf", payeeName: "Ana", note: "", amount: 25_000_000n, expiresAt: null });
  token = created.token;
  const databaseUrl = new URL(process.env.DATABASE_URL as string);
  databaseUrl.pathname = `/${db.sql.options.database}`;
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: new URL("../..", import.meta.url).pathname, env: { ...process.env, DATABASE_URL: databaseUrl.toString(), INVOICE_SECRET: secret, RELAY_IP_PEPPER: "p".repeat(32) }, stdio: "ignore" });
  await ready();
}, 120_000);

afterAll(async () => {
  server?.kill();
  await db.drop();
});

describe("the payer's page in production", () => {
  it("sends its private headers and a policy that names Iris and the source chains, never the kit's usage log", async () => {
    const response = await fetch(`${BASE}/en/pay/${token}`);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/iris-api/);
    expect(csp).not.toMatch(/https:\/\/api\.circle\.com/);
  });

  it("keeps the default permissions on every other route", async () => {
    const response = await fetch(`${BASE}/en/settings`);
    const expected = securityHeaders().find((header) => header.key === "Permissions-Policy")?.value;
    expect(response.headers.get("permissions-policy")).toBe(expected);
  });

  it("answers an unknown token with a 404 of the same size as any other", async () => {
    const a = await fetch(`${BASE}/api/pay/${"C".repeat(22)}`);
    const b = await fetch(`${BASE}/api/pay/${"D".repeat(22)}`);
    expect([a.status, b.status]).toEqual([404, 404]);
    expect((await a.text()).length).toBe((await b.text()).length);
  });

  it("loads within the script budget and ships no wallet or bridge code before a button is pressed", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      let bytes = 0;
      const bodies: string[] = [];
      page.on("response", async (response) => {
        if (response.request().resourceType() !== "script") return;
        const body = await response.text().catch(() => "");
        // transferred bytes, as the Lighthouse budget counts them
        bytes += (await response.request().sizes().catch(() => ({ responseBodySize: body.length }))).responseBodySize;
        bodies.push(body);
      });
      await page.goto(`${BASE}/en/pay/${token}`, { waitUntil: "networkidle" });
      await page.getByText("Pay Ana").waitFor();
      expect(bytes).toBeLessThan(182_000);
      expect(bodies.some((body) => body.includes("stablecoinKits") || body.includes("depositForBurn"))).toBe(false);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
