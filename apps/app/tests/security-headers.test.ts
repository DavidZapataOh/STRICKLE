import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "../src/security-headers.ts";

describe("the security headers", () => {
  const csp = contentSecurityPolicy();

  it("forbids eval, plugins, framing and foreign bases and form targets", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allows a network origin only when a screen asks for it", () => {
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("https://");
    expect(contentSecurityPolicy(["https://rpc.example.test"])).toContain("connect-src 'self' https://rpc.example.test");
  });

  it("sets the companion headers", () => {
    const names = securityHeaders().map((header) => header.key);
    expect(names).toEqual(["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]);
  });
});
