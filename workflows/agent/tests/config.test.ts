// workflows/agent/tests/config.test.ts
import { describe, expect, it } from "vitest";
import { configSchema } from "../config.ts";

const valid = {
  schedule: "0 */10 * * * *",
  chainName: "arc-testnet",
  factoryAddress: "0x00000000000000000000000000000000000000aa",
  heartbeatAddress: "0x00000000000000000000000000000000000000bb",
  stateAddress: "0x00000000000000000000000000000000000000cc",
  executorAddress: "0x00000000000000000000000000000000000000dd",
  rpcUrl: "https://rpc.testnet.arc.io",
  gasLimit: "300000",
  sandboxClock: true,
  dailySchedule: "0 0 * * * *",
  gatewayAddress: "0x00000000000000000000000000000000000000ee",
  chainId: 5042002,
  proverUrl: "https://prover.example.test",
  proverKey: `0x${"ab".repeat(32)}`,
  privateSpendGas: "6500000",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  eurcAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
};

describe("configSchema", () => {
  it("accepts a complete config", () => {
    expect(configSchema.parse(valid)).toEqual(valid);
  });

  it.each(["factoryAddress", "heartbeatAddress", "usdcAddress", "eurcAddress"])("rejects a malformed %s", (key) => {
    expect(() => configSchema.parse({ ...valid, [key]: "0x123" })).toThrow();
  });

  it("rejects a malformed executor address", () => {
    expect(() => configSchema.parse({ ...valid, executorAddress: "0x1" })).toThrow();
  });

  it("requires the sandbox clock flag", () => {
    const without = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "sandboxClock"));
    expect(() => configSchema.parse(without)).toThrow();
  });

  it("requires a daily schedule", () => {
    const rest = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "dailySchedule"));
    expect(() => configSchema.parse(rest)).toThrow();
  });

  it("rejects a malformed gateway address", () => {
    expect(() => configSchema.parse({ ...valid, gatewayAddress: "0x1" })).toThrow();
  });

  it.each(["proverUrl", "proverKey", "privateSpendGas"])("requires %s", (key) => {
    const without = Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key));
    expect(() => configSchema.parse(without)).toThrow();
  });

  it("rejects a prover key that is not 32 bytes of hex", () => {
    expect(() => configSchema.parse({ ...valid, proverKey: "0x1234" })).toThrow();
  });

  it("rejects a gas limit that is not a number string", () => {
    expect(() => configSchema.parse({ ...valid, gasLimit: "lots" })).toThrow();
  });

  it("rejects an unknown chain name", () => {
    expect(() => configSchema.parse({ ...valid, chainName: "mainnet" })).toThrow();
  });

  it("rejects a non-https rpc url", () => {
    expect(() => configSchema.parse({ ...valid, rpcUrl: "http://rpc.testnet.arc.io" })).toThrow();
  });

  it("rejects a malformed state address", () => {
    expect(() => configSchema.parse({ ...valid, stateAddress: "0x1" })).toThrow();
  });
});
