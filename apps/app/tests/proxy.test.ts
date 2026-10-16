import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../src/proxy.ts";

const call = (url: string, acceptLanguage?: string) =>
  proxy(new NextRequest(url, { headers: acceptLanguage ? { "accept-language": acceptLanguage } : {} }), { env: {} });

// A gate test names its environment and has no session store, so every session reads as unknown.
const callWith = (env: Record<string, string | undefined>, url: string, options: { agentMode?: "cre-testnet" | "none" } = {}) => proxy(new NextRequest(url), { env, checker: { state: async () => "unknown" as const }, ...options });

describe("the locale redirect", () => {
  it("sends a bare visit to the preferred locale", async () => {
    const response = await call("http://app.test/", "pt-BR,pt;q=0.9");
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://app.test/pt-br");
  });

  it("keeps the path and the query string the landing sends", async () => {
    expect((await call("http://app.test/verify?x=1", "es"))?.headers.get("location")).toBe("http://app.test/es/verify?x=1");
    expect((await call("http://app.test/docs", "en"))?.headers.get("location")).toBe("http://app.test/en/docs");
  });

  it("lets the landing's lang parameter win over the browser's language", async () => {
    expect((await call("http://app.test/?lang=es", "en"))?.headers.get("location")).toBe("http://app.test/es?lang=es");
  });

  it("sends the landing simulator's hand-off straight to the flow, with every value and its language", async () => {
    const response = await call("http://app.test/?amount=3200&country=CO&goal=2000&lang=es", "en");
    expect(response?.headers.get("location")).toBe("http://app.test/es/start?amount=3200&country=CO&goal=2000&lang=es");
    expect((await call("http://app.test/?country=MX", "pt-BR"))?.headers.get("location")).toBe("http://app.test/pt-br/start?country=MX");
    expect((await call("http://app.test/verify?amount=1", "en"))?.headers.get("location")).toBe("http://app.test/en/verify?amount=1");
  });

  it("ignores a lang parameter that is not a supported locale", async () => {
    expect((await call("http://app.test/?lang=fr", "pt-BR"))?.headers.get("location")).toBe("http://app.test/pt-br?lang=fr");
  });

  it("leaves a localized path alone", async () => {
    expect(await call("http://app.test/es/boxes")).toBeUndefined();
  });

  it("never redirects an API route to a locale", async () => {
    expect(await call("http://app.test/api/logs?kind=notice")).toBeUndefined();
    expect(await call("http://app.test/api")).toBeUndefined();
  });

  it("sends API routes through the gate and keeps static files out", async () => {
    const matcher = new RegExp(`^${(config.matcher as string[])[0]}$`);
    expect(matcher.test("/api/logs")).toBe(true);
    expect(matcher.test("/boxes")).toBe(true);
    expect(matcher.test("/_next/static/a.js")).toBe(false);
  });
});

describe("the access gate", () => {
  it("does not prefix API routes with a locale and gates them like pages", async () => {
    expect(await call("http://app.test/api/metrics")).toBeUndefined();
    const closed = await callWith({ ACCESS_MODE: "closed" }, "http://app.test/api/agent-action");
    expect(closed?.status).toBe(503);
    const noCookie = await callWith({ ACCESS_MODE: "invite", ACCESS_COOKIE_SECRET: "s".repeat(40) }, "http://app.test/api/agent-action");
    expect(noCookie?.status).toBe(401);
  });

  it("sends a visitor without a session to the access page and remembers where they were going", async () => {
    const response = await callWith({ ACCESS_MODE: "invite", ACCESS_COOKIE_SECRET: "s".repeat(40) }, "http://app.test/en/start?amount=3200");
    expect(response?.headers.get("location")).toBe("http://app.test/en/access");
    expect(response?.headers.get("set-cookie")).toContain(`strickle_next=${encodeURIComponent("/en/start?amount=3200")}`);
  });

  it("answers the unavailable page for the app's screens where no agent exists, in the visitor's language, and leaves everything else alone", async () => {
    const response = await callWith({}, "http://app.test/pt-br/boxes", { agentMode: "none" });
    expect(response?.headers.get("x-middleware-rewrite")).toBe("http://app.test/pt-br/unavailable");
    expect(await callWith({}, "http://app.test/pt-br/metrics", { agentMode: "none" })).toBeUndefined();
    expect(await callWith({}, "http://app.test/api/logs", { agentMode: "none" })).toBeUndefined();
    expect(await callWith({}, "http://app.test/pt-br/boxes", { agentMode: "cre-testnet" })).toBeUndefined();
  });

  it("still asks an uninvited visitor for a code before showing the unavailable page", async () => {
    const response = await callWith({ ACCESS_MODE: "invite", ACCESS_COOKIE_SECRET: "s".repeat(40) }, "http://app.test/en/boxes", { agentMode: "none" });
    expect(response?.headers.get("location")).toBe("http://app.test/en/access");
  });
});

describe("the account view path", () => {
  const vault = "0x00000000000000000000000000000000000000a1";

  it("lets an address through", async () => {
    expect(await call(`http://app.test/en/view/${vault}`)).toBeUndefined();
  });

  it("answers a path that is not an address with a 404 before the page streams, whatever the language", async () => {
    for (const path of ["/en/view/not-an-address", "/pt-br/view/0x123", "/es/view/"]) {
      const response = await call(`http://app.test${path}`);
      expect(response?.headers.get("x-middleware-rewrite"), path).toContain("/_missing");
    }
  });
});
