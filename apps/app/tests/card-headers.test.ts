import { describe, expect, it } from "vitest";
import { onrampKey } from "./support/onramp-keys.ts";
import { onrampConfig } from "../src/onramp/environment.ts";
import { cardHeaderExtra } from "../src/payments/card-headers.ts";
import { payHeaders } from "../src/payments/headers.ts";
import { contentSecurityPolicy, permissionsPolicy, securityHeaders } from "../src/security-headers.ts";

const card = onrampConfig({ ONRAMP_API_KEY: onrampKey("TEST", "a:b"), ONRAMP_REFERRER_DOMAIN: "app.strickle.xyz" }, "testnet");
const value = (headers: { key: string; value: string }[], key: string) => headers.find((header) => header.key === key)?.value ?? "";

describe("the default policy", () => {
  it("still forbids frames, camera, microphone and payment everywhere", () => {
    expect(contentSecurityPolicy()).not.toContain("frame-src");
    expect(permissionsPolicy()).toBe("camera=(), microphone=(), geolocation=(), payment=()");
    expect(value(securityHeaders(), "Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });
});

describe("the pay route with card payments configured", () => {
  const headers = payHeaders("testnet", cardHeaderExtra(card));

  it("lets the page embed the widget origin and talk to it and to Circle's API, and nothing more", () => {
    const csp = value(headers, "Content-Security-Policy");
    expect(csp).toContain("frame-src https://onramp-sandbox.arc.io");
    expect(csp).toContain("https://api-test.circle.com");
    expect(csp).not.toContain("https://api.circle.com");
    expect(csp).not.toContain("onramp.arc.io ");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("grants the widget origin, and only that origin, camera, microphone, payment and the clipboard", () => {
    const policy = value(headers, "Permissions-Policy");
    for (const feature of ["camera", "microphone", "payment", "clipboard-read", "clipboard-write"]) {
      expect(policy).toContain(`${feature}=("https://onramp-sandbox.arc.io")`);
    }
    expect(policy).toContain("geolocation=()");
    expect(policy).not.toContain("*");
    expect(policy).not.toContain("self");
  });

  it("keeps the page's other headers", () => {
    expect(value(headers, "Referrer-Policy")).toBe("no-referrer");
    expect(value(headers, "X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value(headers, "Cache-Control")).toBe("no-store");
  });
});

describe("the pay route without card payments", () => {
  it("is exactly what it was before this option existed", () => {
    const headers = payHeaders("testnet", cardHeaderExtra(null));
    expect(value(headers, "Content-Security-Policy")).not.toContain("frame-src");
    expect(value(headers, "Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });
});

describe("production", () => {
  it("uses the production origins and never the sandbox ones", () => {
    const live = onrampConfig({ ONRAMP_API_KEY: onrampKey("LIVE", "a:b"), ONRAMP_REFERRER_DOMAIN: "app.strickle.xyz" }, "mainnet");
    const headers = payHeaders("mainnet", cardHeaderExtra(live));
    expect(value(headers, "Content-Security-Policy")).toContain("frame-src https://onramp.arc.io");
    expect(value(headers, "Content-Security-Policy")).not.toContain("sandbox");
    expect(value(headers, "Permissions-Policy")).toContain('payment=("https://onramp.arc.io")');
  });
});
