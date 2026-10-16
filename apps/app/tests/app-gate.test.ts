import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isAgentScreen, unavailableResponse } from "../src/lib/app-gate.ts";

const request = (path: string) => new NextRequest(`http://app.test${path}`);

describe("isAgentScreen", () => {
  it("is true for the screens that need an agent, in every locale", () => {
    for (const path of ["/en", "/es/", "/pt-br/start", "/en/activity", "/es/boxes", "/pt-br/settings", "/en/deposit", "/en/invoices"]) expect(isAgentScreen(path), path).toBe(true);
  });

  it("is false for what works without one, and for anything outside a locale", () => {
    for (const path of ["/en/access", "/en/closed", "/en/verify", "/es/docs", "/es/metrics", "/pt-br/view/0xabc", "/pt-br/accountant", "/en/unavailable", "/api/logs", "/api/agent-action", "/", "/fr/boxes"]) expect(isAgentScreen(path), path).toBe(false);
  });
});

describe("unavailableResponse", () => {
  it("does nothing where an agent exists", () => {
    expect(unavailableResponse(request("/en/boxes"), "cre-testnet")).toBeUndefined();
    expect(unavailableResponse(request("/en/deposit"), "cre-testnet")).toBeUndefined();
  });

  it("rewrites the agent screens, keeping the visitor's language, when there is no agent", () => {
    const response = unavailableResponse(request("/pt-br/boxes"), "none");
    expect(response?.headers.get("x-middleware-rewrite")).toBe("http://app.test/pt-br/unavailable");
    expect(unavailableResponse(request("/es"), "none")?.headers.get("x-middleware-rewrite")).toBe("http://app.test/es/unavailable");
    expect(unavailableResponse(request("/en/deposit"), "none")?.headers.get("x-middleware-rewrite")).toBe("http://app.test/en/unavailable");
  });

  it("leaves the public pages and the API alone", () => {
    for (const path of ["/en/metrics", "/en/docs", "/en/access", "/en/unavailable", "/api/logs"]) expect(unavailableResponse(request(path), "none"), path).toBeUndefined();
  });
});
