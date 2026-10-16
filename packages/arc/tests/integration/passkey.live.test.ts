import { createServer } from "vite";
import { chromium } from "playwright-core";
import { createPublicClient, encodeFunctionData, erc20Abi, hashTypedData, http, parseAbi, type Address, type Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { networks, rpcUrl, transferSponsored, walletsClient } from "../../src/index.ts";

const network = networks.testnet;
const clientKey = process.env.CIRCLE_CLIENT_KEY_TESTNET;
const walletId = process.env.CIRCLE_GAS_STATION_SCA_WALLET_ID;

interface Harness {
  open(mode: "register" | "login", username?: string): Promise<Address>;
  sendCalls(calls: { to: Address; data: Hex; value?: string }[], options?: { sponsored?: boolean }): Promise<Hex>;
  transfer(to: Address, amount: string): Promise<Hex>;
  signTypedData(typed: unknown): Promise<Hex>;
}

describe.skipIf(!clientKey || !walletId)("passkey wallet on Arc testnet", () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;
  let cdp: Awaited<ReturnType<Awaited<ReturnType<typeof browser.newContext>>["newCDPSession"]>>;
  let authenticatorId = "";
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
    cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const added = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    authenticatorId = added.authenticatorId;
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

  it("sends a two-call batch sponsored by the paymaster and leaves the balance alone", async () => {
    const username = `strickle-batch-${Date.now()}`;
    const address = await harness("open", "register", username);
    const circle = walletsClient("testnet");
    const funder = (await circle.getWallet({ id: walletId as string })).data?.wallet?.address as Address;
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [funder, 0n] });
    const tx = await harness("sendCalls", [
      { to: network.usdc, data: approve },
      { to: address, data: "0x" },
    ]);
    expect(tx).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(await balance(address)).toBe(0n);
  });

  it("pays its own gas when the batch is sent unsponsored", async () => {
    const username = `strickle-own-gas-${Date.now()}`;
    const address = await harness("open", "register", username);
    const circle = walletsClient("testnet");
    const funder = (await circle.getWallet({ id: walletId as string })).data?.wallet?.address as Address;
    await transferSponsored({ circle, network, walletAddress: funder, to: address, token: network.usdc, amount: "1" });
    const before = await balance(address);
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [funder, 0n] });
    const tx = await harness("sendCalls", [{ to: network.usdc, data: approve }], { sponsored: false });
    expect(tx).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(await balance(address)).toBeLessThan(before);
  });

  it("signs a returning user in without asking for a name when the authenticator holds one passkey", async () => {
    // a browser asks the person to pick when several passkeys exist; the virtual authenticator cannot, so this case starts from one
    await cdp.send("WebAuthn.clearCredentials", { authenticatorId });
    const username = `strickle-login-${Date.now()}`;
    const address = await harness("open", "register", username);
    expect(await harness("open", "login")).toBe(address);
  });

  it("signs typed data that the deployed account accepts through ERC-1271", async () => {
    const username = `strickle-sig-${Date.now()}`;
    const address = await harness("open", "register", username);
    const circle = walletsClient("testnet");
    const funder = (await circle.getWallet({ id: walletId as string })).data?.wallet?.address as Address;
    await transferSponsored({ circle, network, walletAddress: funder, to: address, token: network.usdc, amount: "0.1" });
    await harness("transfer", funder, "0.05"); // the first user operation deploys the account

    const typed = {
      domain: { name: "Strickle Agent", version: "1", chainId: network.chain.id, verifyingContract: "0x00000000000000000000000000000000000000dd" },
      types: { Action: [{ name: "vault", type: "address" }, { name: "actionHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
      primaryType: "Action",
      message: { vault: "0x00000000000000000000000000000000000000a1", actionHash: `0x${"ab".repeat(32)}`, nonce: "1", deadline: "1800000300" },
    };
    const signature = await harness("signTypedData", typed);
    const MAGIC = "0x1626ba7e";
    const isValid = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);
    // an account may revert instead of answering 0xffffffff for a signature it refuses: both count as "not accepted"
    const accepts = async (hash: Hex): Promise<boolean> => {
      try {
        return (await publicClient.readContract({ address, abi: isValid, functionName: "isValidSignature", args: [hash, signature] })) === MAGIC;
      } catch {
        return false;
      }
    };
    const digest = hashTypedData({ ...typed, message: { ...typed.message, nonce: 1n, deadline: 1_800_000_300n } } as never);
    const other = hashTypedData({ ...typed, message: { ...typed.message, nonce: 2n, deadline: 1_800_000_300n } } as never);
    expect(await accepts(digest)).toBe(true);
    expect(await accepts(other)).toBe(false);
  });
});
