import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { factoryCanEarn, readEarn } from "../src/chain/earn.ts";

const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const;
const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const;
const offered = [{ address: EARN, name: "EarnKit USDC Vault", protocol: "Morpho" }];
const BOX = { taxes: 1, payroll: 2, salary: 3, operating: 4, emergency: 5, profit: 6 } as const;

function client(over: { version?: number | "missing"; shares?: Record<number, bigint>; approved?: bigint } = {}): PublicClient {
  const shares = over.shares ?? { 6: 3_000_000_000_000_000_000n };
  return {
    readContract: async ({ address, functionName, args }: { address: string; functionName: string; args?: readonly unknown[] }) => {
      if (functionName === "EARN_VERSION") {
        if (over.version === "missing") throw new Error("execution reverted");
        return over.version ?? 1;
      }
      if (functionName === "invested") return Number(args?.[1]) === BOX.profit ? 3_000_000n : 0n;
      if (functionName === "vaultApprovedFrom") return over.approved ?? 1_900_000_000n;
      if (functionName === "sharesOf") return shares[Number(args?.[1])] ?? 0n;
      if (functionName === "maxInvestBps") return Number(args?.[0]) === BOX.payroll || Number(args?.[0]) === BOX.operating ? 0 : 10_000;
      if (functionName === "previewRedeem" && address === EARN) return ((args?.[0] as bigint) * 1_001_058n) / 10n ** 18n;
      throw new Error(`unexpected ${functionName}`);
    },
  } as unknown as PublicClient;
}

describe("reading what a vault has put to work", () => {
  it("says it is not supported when the vault has no earn version", async () => {
    expect(await readEarn(VAULT, offered, client({ version: "missing" }))).toEqual({ supported: false, reason: "old" });
  });

  it("reads the approval, the shares per box and what they are worth, and each box's investable share", async () => {
    const state = await readEarn(VAULT, offered, client());
    if (!state.supported) throw new Error("unsupported");
    expect(state.vaults).toEqual([{ vault: EARN, approvedFrom: 1_900_000_000, shares: { profit: 3_000_000_000_000_000_000n }, value: { profit: 3_003_174n } }]);
    expect(state.maxInvestBps).toEqual({ taxes: 10_000, payroll: 0, operating: 0, emergency: 10_000, profit: 10_000 });
    expect(state.invested).toMatchObject({ profit: 3_000_000n, taxes: 0n });
  });

  it("leaves out boxes that hold no shares and never reads the salary box", async () => {
    const state = await readEarn(VAULT, offered, client({ shares: {} }));
    if (!state.supported) throw new Error("unsupported");
    expect(state.vaults[0]).toMatchObject({ shares: {}, value: {} });
    expect(Object.keys(state.maxInvestBps)).not.toContain("salary");
  });

  it("is unreadable, not old, when a read fails for any reason but a revert", async () => {
    const broken = { readContract: async ({ functionName }: { functionName: string }) => { if (functionName === "EARN_VERSION") return 1; throw new Error("rate limited"); } } as unknown as PublicClient;
    expect(await readEarn(VAULT, offered, broken)).toEqual({ supported: false, reason: "unreadable" });
    const down = { readContract: async () => { throw new Error("fetch failed"); } } as unknown as PublicClient;
    expect(await readEarn(VAULT, offered, down)).toEqual({ supported: false, reason: "unreadable" });
  });
});

describe("whether a factory makes vaults that can earn", () => {
  const factory = "0x515EDF42f25af87aE7d806197232048D4A212100" as const;
  const implementation = "0xd230cC8a0F39db9C5CAA8466A7195e2C328384a3" as const;
  const asking = (earnVersion: "ok" | "missing" | "factory-down") =>
    ({
      readContract: async ({ address, functionName }: { address: string; functionName: string }) => {
        if (functionName === "implementation") {
          if (earnVersion === "factory-down") throw new Error("down");
          return implementation;
        }
        if (functionName === "EARN_VERSION" && address === implementation) {
          if (earnVersion === "missing") throw new Error("execution reverted");
          return 1;
        }
        throw new Error(`unexpected ${functionName}`);
      },
    }) as unknown as PublicClient;

  it("is true when the implementation has an earn version and false otherwise", async () => {
    expect(await factoryCanEarn(factory, asking("ok"))).toBe(true);
    expect(await factoryCanEarn(factory, asking("missing"))).toBe(false);
    expect(await factoryCanEarn(factory, asking("factory-down"))).toBe(false);
  });
});
