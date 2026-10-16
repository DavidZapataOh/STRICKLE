import { describe, expect, it } from "vitest";
import { depositConnectOrigins } from "../src/deposit/csp.ts";
import { contentSecurityPolicy } from "../src/security-headers.ts";

describe("the deposit route's policy", () => {
  it("allows Iris and the source-chain endpoints of the network, and nothing else", () => {
    const testnet = depositConnectOrigins("testnet");
    expect(testnet).toContain("https://iris-api-sandbox.circle.com");
    expect(testnet).toContain("https://sepolia.base.org");
    expect(testnet).not.toContain("https://iris-api.circle.com");
    expect(depositConnectOrigins("mainnet")).toContain("https://iris-api.circle.com");
  });

  it("blocks the kit's usage-log endpoint", () => {
    expect(contentSecurityPolicy(depositConnectOrigins("testnet"))).not.toContain("api.circle.com/v1");
    expect(contentSecurityPolicy(depositConnectOrigins("testnet"))).not.toMatch(/https:\/\/api\.circle\.com/);
  });

  it("lists each origin once", () => {
    const origins = depositConnectOrigins("testnet");
    expect(new Set(origins).size).toBe(origins.length);
  });
});
