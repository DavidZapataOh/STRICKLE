import { createServer } from "vite";
import { chromium } from "playwright-core";
import { createPublicClient, erc20Abi, http, type Address, type Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { networks, rpcUrl, transferSponsored, walletsClient } from "../../src/index.ts";

const network = networks.testnet;
const clientKey = process.env.CIRCLE_CLIENT_KEY_TESTNET;
const walletId = process.env.CIRCLE_GAS_STATION_SCA_WALLET_ID;

interface Harness {
  open(mode: "register" | "login", username: string): Promise<Address>;
  transfer(to: Address, amount: string): Promise<Hex>;
}

describe.skipIf(!clientKey || !walletId)("passkey wallet on Arc testnet", () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;
  const publicClient = createPublicClient({ chain: network.chain, transport: http(rpcUrl("testnet")) });
  const balance = (who: Address) => publicClient.readContract({ address: network.usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] });

  beforeAll(async () => {
    server = await createServer({
      root: new URL("../../e2e/passkey", import.meta.url).pathname,
      server: { host: "localhost", port: 5199, strictPort: true },
      define: { __CLIENT_KEY__: JSON.stringify(clientKey) },
      logLevel: "error",
    });
    await server.listen();
    browser = await chromium.launch();
    const context = await browser.newContext();
    page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await page.goto("http://localhost:5199/");
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  const harness = <K extends keyof Harness>(method: K, ...args: Parameters<Harness[K]>) =>
    page.evaluate(`window.passkey[${JSON.stringify(method)}](...${JSON.stringify(args)})`) as Promise<Awaited<ReturnType<Harness[K]>>>;

  it("registers, returns to the same address, and sends a sponsored transfer", async () => {
    const username = `strickle-${Date.now()}`;
    const address = await harness("open", "register", username);
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(await harness("open", "login", username)).toBe(address);

    const circle = walletsClient("testnet");
    const funder = (await circle.getWallet({ id: walletId as string })).data?.wallet?.address as Address;
    await transferSponsored({ circle, network, walletAddress: funder, to: address, token: network.usdc, amount: "0.3" });
    expect(await balance(address)).toBe(300_000n);

    const tx = await harness("transfer", funder, "0.1");
    expect(tx).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(await balance(address)).toBe(200_000n);

    await harness("transfer", funder, "0.2");
    expect(await balance(address)).toBe(0n);
    console.log(`passkey wallet ${address}\nsponsored transfer ${network.explorerUrl}/tx/${tx}`);
  });
});
