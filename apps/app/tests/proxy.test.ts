import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../src/proxy.ts";

const call = (url: string, acceptLanguage?: string) =>
  proxy(new NextRequest(url, { headers: acceptLanguage ? { "accept-language": acceptLanguage } : {} }));

describe("the locale redirect", () => {
  it("sends a bare visit to the preferred locale", () => {
    const response = call("http://app.test/", "pt-BR,pt;q=0.9");
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://app.test/pt-br");
  });

  it("keeps the path and the query string the landing sends", () => {
    expect(call("http://app.test/verify?x=1", "es")?.headers.get("location")).toBe("http://app.test/es/verify?x=1");
    expect(call("http://app.test/docs", "en")?.headers.get("location")).toBe("http://app.test/en/docs");
  });

  it("lets the landing's lang parameter win over the browser's language", () => {
    expect(call("http://app.test/?lang=es", "en")?.headers.get("location")).toBe("http://app.test/es?lang=es");
  });

  it("sends the landing simulator's hand-off straight to the flow, with every value and its language", () => {
    const response = call("http://app.test/?amount=3200&country=CO&goal=2000&lang=es", "en");
    expect(response?.headers.get("location")).toBe("http://app.test/es/start?amount=3200&country=CO&goal=2000&lang=es");
    expect(call("http://app.test/?country=MX", "pt-BR")?.headers.get("location")).toBe("http://app.test/pt-br/start?country=MX");
    expect(call("http://app.test/verify?amount=1", "en")?.headers.get("location")).toBe("http://app.test/en/verify?amount=1");
  });

  it("ignores a lang parameter that is not a supported locale", () => {
    expect(call("http://app.test/?lang=fr", "pt-BR")?.headers.get("location")).toBe("http://app.test/pt-br?lang=fr");
  });

  it("leaves a localized path alone", () => {
    expect(call("http://app.test/es/boxes")).toBeUndefined();
  });

  it("never redirects an API route to a locale", () => {
    expect(call("http://app.test/api/logs?kind=notice")).toBeUndefined();
    expect(call("http://app.test/api")).toBeUndefined();
  });

  it("excludes api from the matcher as well", () => {
    const matcher = new RegExp(`^${(config.matcher as string[])[0]}$`);
    expect(matcher.test("/api/logs")).toBe(false);
    expect(matcher.test("/boxes")).toBe(true);
    expect(matcher.test("/apiary")).toBe(true);
  });
});

describe("the account view path", () => {
  const vault = "0x00000000000000000000000000000000000000a1";

  it("lets an address through", () => {
    expect(call(`http://app.test/en/view/${vault}`)).toBeUndefined();
  });

  it("answers a path that is not an address with a 404 before the page streams, whatever the language", () => {
    for (const path of ["/en/view/not-an-address", "/pt-br/view/0x123", "/es/view/"]) {
      const response = call(`http://app.test${path}`);
      expect(response?.headers.get("x-middleware-rewrite"), path).toContain("/_missing");
    }
  });
});
