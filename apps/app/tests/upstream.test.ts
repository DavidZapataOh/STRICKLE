import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { PAGE_SIZE, buildUpstream, explorerApiFor } from "../src/app/api/logs/upstream.ts";

const deployments = { chainId: 5042002, BoxVaultFactory: "0x00000000000000000000000000000000000000f1", AgentState: "0x00000000000000000000000000000000000000f2", AgentExecutor: "0x00000000000000000000000000000000000000f3" } as const;
const vault = "0x00000000000000000000000000000000000000a1" as const;
const topic0 = (signature: string) => keccak256(toBytes(signature));
const options = { base: "https://explorer.example/api", fromBlock: 100, page: 1 };

describe("buildUpstream", () => {
  it("asks for the notices of one vault from the state contract", () => {
    const url = new URL(buildUpstream("notice", vault, deployments, { ...options, apiKey: "key123" }));
    expect(url.searchParams.get("module")).toBe("logs");
    expect(url.searchParams.get("address")).toBe(deployments.AgentState);
    expect(url.searchParams.get("topic0")).toBe(topic0("Notice(address,uint64,bytes)"));
    expect(url.searchParams.get("topic1")).toBe(`0x${"0".repeat(24)}${vault.slice(2)}`);
    expect(url.searchParams.get("fromBlock")).toBe("100");
    expect(url.searchParams.get("offset")).toBe(String(PAGE_SIZE));
    expect(url.searchParams.get("apikey")).toBe("key123");
  });

  it("asks for the vault's own allocations without a vault topic", () => {
    const url = new URL(buildUpstream("allocated", vault, deployments, { ...options, page: 3 }));
    expect(url.searchParams.get("address")).toBe(vault);
    expect(url.searchParams.get("topic0")).toBe(topic0("Allocated(uint8,uint8,uint256,uint256)"));
    expect(url.searchParams.get("topic1")).toBeNull();
    expect(url.searchParams.get("apikey")).toBeNull();
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("asks the executor for its splits and salary payments of that vault", () => {
    for (const [kind, signature] of [["split", "Split(address,uint8,uint256)"], ["salary", "SalaryPaid(address,uint8,address,uint256)"]] as const) {
      const url = new URL(buildUpstream(kind, vault, deployments, options));
      expect(url.searchParams.get("address")).toBe(deployments.AgentExecutor);
      expect(url.searchParams.get("topic0")).toBe(topic0(signature));
      expect(url.searchParams.get("topic0_1_opr")).toBe("and");
      expect(url.searchParams.get("topic1")).toBe(`0x${"0".repeat(24)}${vault.slice(2)}`);
    }
  });

  it("reads the executor's PrivateSpend events of one vault", () => {
    const url = new URL(buildUpstream("private-spend", vault, deployments, options));
    expect(url.searchParams.get("address")).toBe(deployments.AgentExecutor);
    expect(url.searchParams.get("topic0")).toBe(topic0("PrivateSpend(address,uint256)"));
    expect(url.searchParams.get("topic0_1_opr")).toBe("and");
    expect(url.searchParams.get("topic1")).toBe(`0x${"0".repeat(24)}${vault.slice(2)}`);
  });
});

describe("explorerApiFor", () => {
  it("uses the keyed hosted API when there is a key and the explorer's own endpoint when there is not", () => {
    expect(explorerApiFor(5042002, "https://explorer.testnet.arc.io", "k")).toBe("https://api.blockscout.com/5042002/api/");
    expect(explorerApiFor(5042002, "https://explorer.testnet.arc.io")).toBe("https://explorer.testnet.arc.io/api");
  });
});
