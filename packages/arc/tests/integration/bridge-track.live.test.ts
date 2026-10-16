import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { sourceChain } from "../../src/bridge/chains.ts";
import { executeDeposit } from "../../src/bridge/execute.ts";
import { createDepositKit } from "../../src/bridge/kit.ts";
import { quoteDeposit } from "../../src/bridge/quote.ts";
import { trackDeposit } from "../../src/bridge/track.ts";
import { networks } from "../../src/networks.ts";

const key = process.env.DEPOSIT_TEST_KEY as `0x${string}` | undefined;
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const;
const arc = createPublicClient({ chain: networks.testnet.chain, transport: http(networks.testnet.rpcUrl) });

describe.skipIf(!key)("a real deposit from another chain (needs DEPOSIT_TEST_KEY funded by the owner)", () => {
  it.each([["Avalanche_Fuji", false], ["Base_Sepolia", true]] as const)("%s reaches the vault (exact: %s)", async (id, exact) => {
    const adapter = createViemAdapterFromPrivateKey({ privateKey: key as `0x${string}` });
    const kit = createDepositKit();
    const source = sourceChain("testnet", id);
    const quote = await quoteDeposit({ kit, adapter }, { network: "testnet", source, sourceAddress: privateKeyToAccount(key as `0x${string}`).address, vault: VAULT, amountSent: 1_000_000n, speed: "fast" });
    expect(quote.exact).toBe(exact);
    const events: unknown[] = [];
    kit.on("*", (event: unknown) => events.push(event));
    const { burnTx } = await executeDeposit({ kit, adapter }, quote, () => {});
    console.info("kit event payloads", JSON.stringify(events.slice(0, 6)));
    let result = await trackDeposit({ network: "testnet", source, burnTx, vault: VAULT, client: arc });
    for (let i = 0; i < 90 && result.state === "waiting"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      result = await trackDeposit({ network: "testnet", source, burnTx, vault: VAULT, client: arc });
    }
    expect(result.state).toBe("arrived");
    if (result.state !== "arrived") return;
    expect(result.received).toBeGreaterThanOrEqual(quote.amountReceivedMin);
    if (exact) expect(result.received).toBe(1_000_000n);
    expect(await trackDeposit({ network: "testnet", source, burnTx, vault: VAULT, client: arc })).toEqual(result);
  });
});
