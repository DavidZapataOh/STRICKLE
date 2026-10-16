import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { http, bytesToHex, createPublicClient } from "viem";
import { networks } from "@strickle/arc/networks";
import { executorAbi, vaultAbi } from "../../src/chain/abi.ts";
import { deploymentsFor } from "../../src/config/network.ts";
import { decodeRecoveryCode, noticePublicKey } from "../../src/keys/recovery-code.ts";
import { SKIP_REASON, completeOnboarding, liveEnabled } from "./support.ts";

const chain = createPublicClient({ transport: http(networks.testnet.rpcUrl) });
const deployed = deploymentsFor("testnet");

test.skip(!liveEnabled, SKIP_REASON);

const storedKey = (page: import("@playwright/test").Page, vault: string) =>
  page.evaluate(
    (name) =>
      new Promise<{ wrappedHex: string } | null>((resolve, reject) => {
        const open = indexedDB.open("strickle-keys");
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          try {
            const get = db.transaction("secrets").objectStore("secrets").get(name);
            get.onerror = () => {
              db.close();
              reject(get.error);
            };
            get.onsuccess = () => {
              const record = get.result as { wrapped: ArrayBuffer } | undefined;
              db.close();
              resolve(record ? { wrappedHex: [...new Uint8Array(record.wrapped)].map((byte) => byte.toString(16).padStart(2, "0")).join("") } : null);
            };
          } catch (error) {
            db.close();
            reject(error);
          }
        };
      }),
    `notice-key:${vault.toLowerCase()}`,
  );

test("a new user ends onboarding with boxes, agent, profile and a recoverable notice key on Arc testnet", async ({ page, context }) => {
  test.setTimeout(900_000);
  const { owner, vault, username, code } = await completeOnboarding(page, context);
  expect(vault).not.toMatch(/^0x0+$/);
  expect(await chain.readContract({ address: vault, abi: vaultAbi, functionName: "agent" })).toBe(deployed.AgentExecutor);
  expect(await chain.readContract({ address: deployed.AgentExecutor, abi: executorAbi, functionName: "registered", args: [vault] })).toBe(true);
  expect(await chain.readContract({ address: vault, abi: vaultAbi, functionName: "approvedFrom", args: [3, owner] })).toBeGreaterThan(0n);
  console.log(`onboarded ${owner}, vault ${vault}`);

  // the key is at rest wrapped, never in the clear
  const secret = decodeRecoveryCode(code);
  expect(secret).toBeDefined();
  const stored = await storedKey(page, vault);
  expect(stored).not.toBeNull();
  expect(stored?.wrappedHex).not.toContain((secret as bigint).toString(16).padStart(64, "0"));

  // a device that lost its key gets it back from the code: wipe the storage, sign in, restore
  await page.evaluate(() => new Promise<void>((resolve) => Object.assign(indexedDB.deleteDatabase("strickle-keys"), { onsuccess: () => resolve() })));
  expect(await storedKey(page, vault).catch(() => null)).toBeNull();
  await page.goto("/en/start?mode=login", { waitUntil: "networkidle" });
  await page.getByLabel("Choose a name for your passkey").fill(username);
  await page.getByRole("button", { name: "Sign in with my passkey" }).click();
  await expect(page.getByRole("heading", { name: "Restore your notices" })).toBeVisible({ timeout: 120_000 });
  await page.getByLabel("Recovery code").fill(code.toLowerCase().replaceAll("-", " "));
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Your boxes are ready" })).toBeVisible();
  expect(await storedKey(page, vault)).not.toBeNull();

  // the enclave only runs while the CRE workflow is active: the profile check is optional
  if (process.env.EXPECT_ENCLAVE === "1") {
    await expect
      .poll(
        () => {
          try {
            return JSON.parse(execFileSync("node", ["--env-file=/Users/david/tameion/.env", "apps/app/scripts/read-state.mjs", vault], { encoding: "utf8", cwd: "../.." })) as Record<string, unknown>;
          } catch {
            return null;
          }
        },
        { timeout: 600_000, intervals: [15_000] },
      )
      .toMatchObject({ taxRateBps: 3000, userKey: bytesToHex(noticePublicKey(secret as bigint) as Uint8Array), salary: { proposed: "2000000000" }, limits: { signatureThreshold: "0" }, privateMode: { enabled: false } });
  }
});
