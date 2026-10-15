import { afterEach, describe, expect, it } from "vitest";
import { hostedCrs, urlCircuitLoader } from "../src/browser.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function recordingFetch() {
  const calls: { url: string; range?: string }[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    calls.push({ url, range: headers.get("range") ?? undefined });
    return new Response("{}");
  }) as typeof fetch;
  return calls;
}

describe("hostedCrs", () => {
  it("rewrites only the two CDN hosts to our origin and keeps the range header", async () => {
    const calls = recordingFetch();
    hostedCrs("https://static.example/crs/");
    await fetch("https://crs.aztec-cdn.foundation/g1_compressed.dat", { headers: { Range: "bytes=0-4194303" } });
    await fetch("https://crs.aztec-labs.com/g2.dat");
    await fetch("https://elsewhere.example/data.json");
    await fetch(new Request("https://crs.aztec-cdn.foundation/grumpkin_g1_v2.dat", { headers: { Range: "bytes=0-9" } }));
    expect(calls).toEqual([
      { url: "https://static.example/crs/g1_compressed.dat", range: "bytes=0-4194303" },
      { url: "https://static.example/crs/g2.dat", range: undefined },
      { url: "https://elsewhere.example/data.json", range: undefined },
      { url: "https://static.example/crs/grumpkin_g1_v2.dat", range: "bytes=0-9" },
    ]);
  });

  it("restores the original fetch", async () => {
    const calls = recordingFetch();
    const restore = hostedCrs("https://static.example/crs");
    restore();
    await fetch("https://crs.aztec-cdn.foundation/g2.dat");
    expect(calls[0]?.url).toBe("https://crs.aztec-cdn.foundation/g2.dat");
  });
});

describe("urlCircuitLoader", () => {
  it("loads a circuit by name and rejects unsafe names and failed downloads", async () => {
    const calls = recordingFetch();
    const load = urlCircuitLoader("https://static.example/circuits/");
    await load("spend");
    expect(calls[0]?.url).toBe("https://static.example/circuits/spend.json");
    await expect(load("../secret")).rejects.toThrow(/invalid circuit name/);
    globalThis.fetch = (async () => new Response("no", { status: 404 })) as typeof fetch;
    await expect(load("shield")).rejects.toThrow(/404/);
  });
});
