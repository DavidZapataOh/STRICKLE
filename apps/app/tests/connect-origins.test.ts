import { describe, expect, it } from "vitest";
import { connectOrigins, rpcEndpoint } from "../src/config/network.ts";
import { contentSecurityPolicy } from "../src/security-headers.ts";

describe("the origins the browser may talk to", () => {
  it("are Circle's wallet service and the network's RPC endpoint, as bare origins", () => {
    const origins = connectOrigins("testnet");
    expect(origins).toContain("https://modular-sdk.circle.com");
    expect(origins).toContain(new URL(rpcEndpoint("testnet")).origin);
    for (const origin of origins) expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });

  it("never repeat an origin", () => {
    const origins = connectOrigins("testnet");
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("reach the policy that ships with the app", () => {
    const csp = contentSecurityPolicy(connectOrigins("testnet"));
    expect(csp).toContain("https://modular-sdk.circle.com");
    expect(csp).toContain(`connect-src 'self' `);
  });
});
