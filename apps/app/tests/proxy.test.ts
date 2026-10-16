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
    const response = call("http://app.test/?amount=3200&country=CO&goal=salary&lang=es", "en");
    expect(response?.headers.get("location")).toBe("http://app.test/es?amount=3200&country=CO&goal=salary&lang=es");
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

