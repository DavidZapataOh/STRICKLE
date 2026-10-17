import { describe, expect, it } from "vitest";
import { payHeaders } from "../src/payments/headers.ts";

const value = (headers: { key: string; value: string }[], key: string) => headers.find((header) => header.key === key)?.value ?? "";

describe("the payer's page headers", () => {
  const headers = payHeaders("testnet");

  it("keeps the page private and out of search", () => {
    expect(value(headers, "Referrer-Policy")).toBe("no-referrer");
    expect(value(headers, "X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value(headers, "Cache-Control")).toBe("no-store");
  });

  it("allows Iris and Arc and nothing of the kit's usage log", () => {
    const csp = value(headers, "Content-Security-Policy");
    expect(csp).toContain("https://iris-api-sandbox.circle.com");
    expect(csp).toContain("rpc.blockdaemon.testnet.arc.io");
    expect(csp).not.toMatch(/https:\/\/api\.circle\.com/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("frame-src");
  });

  it("keeps payment=() unless a later rail replaces the permissions, and widens only what it is told to", () => {
    expect(value(headers, "Permissions-Policy")).toContain("payment=()");
    const widened = payHeaders("testnet", { connect: ["https://rail.example"], frames: ["https://frame.example"], permissions: "camera=(self)" });
    expect(value(widened, "Content-Security-Policy")).toContain("https://rail.example");
    expect(value(widened, "Content-Security-Policy")).toContain("frame-src https://frame.example");
    expect(value(widened, "Permissions-Policy")).toBe("camera=(self)");
  });
});
