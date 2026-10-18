import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dohResolver, verifyDkim } from "../src/dkim.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.eml`, import.meta.url), "utf8");
const key = JSON.parse(readFileSync(new URL("./fixtures/icloud-key.json", import.meta.url), "utf8")) as { name: string; txt: string };
const resolve = async (name: string) => (name === key.name ? key.txt : null);

describe("verifyDkim on real signed emails", () => {
  it("accepts an email signed by icloud.com and reports who signed what", async () => {
    const result = await verifyDkim(fixture("good"), resolve);
    expect(result).toMatchObject({ ok: true, domain: "icloud.com", selector: "1a1hai", from: "runnier.leagues.0j@icloud.com" });
  });

  it("rejects a changed body", async () => {
    expect(await verifyDkim(fixture("body-tampered"), resolve)).toEqual({ ok: false, reason: "body-hash" });
  });

  it("rejects a changed signed header, including a changed sender", async () => {
    expect(await verifyDkim(fixture("header-tampered"), resolve)).toEqual({ ok: false, reason: "signature" });
    expect(await verifyDkim(fixture("invalid-domain"), resolve)).toEqual({ ok: false, reason: "signature" });
  });

  it("says the key is missing when the selector does not exist", async () => {
    expect(await verifyDkim(fixture("invalid-selector"), resolve)).toEqual({ ok: false, reason: "no-key" });
  });

  it("accepts the same email with Unix line endings", async () => {
    expect((await verifyDkim(fixture("good").replace(/\r\n/g, "\n"), resolve)).ok).toBe(true);
  });

  it("rejects an email with no signature, a signature without the sender, and a wrong key", async () => {
    expect(await verifyDkim("from: a@b.c\r\n\r\nhi", resolve)).toEqual({ ok: false, reason: "no-signature" });
    const noFrom = fixture("good").replace("h=from:", "h=");
    expect((await verifyDkim(noFrom, resolve)).ok).toBe(false);
    const other = key.txt.replace(/p=./, (m) => m.slice(0, 2) + (m[2] === "M" ? "N" : "M"));
    expect((await verifyDkim(fixture("good"), async () => other)).ok).toBe(false);
  });

  it("does not throw on garbage", async () => {
    for (const raw of ["", "\r\n\r\n", "DKIM-Signature: v=1; a=rsa-sha256; b=!!; bh=!!; d=x; s=y; h=from\r\nfrom: a@x\r\n\r\n"]) expect((await verifyDkim(raw, resolve)).ok).toBe(false);
  });
});

describe("dohResolver", () => {
  const answer = (data: string) => async () => new Response(JSON.stringify({ Status: 0, Answer: [{ type: 16, data }] }));

  it("joins the quoted chunks of a TXT answer", async () => {
    expect(await dohResolver(answer('"v=DKIM1; k=rsa; " "p=AAAA"'))("s._domainkey.x.com")).toBe("v=DKIM1; k=rsa; p=AAAA");
  });

  it("returns null for no answer, a failure or a network error", async () => {
    expect(await dohResolver(async () => new Response(JSON.stringify({ Status: 3 })))("a")).toBeNull();
    expect(await dohResolver(async () => new Response("x", { status: 500 }))("a")).toBeNull();
    expect(await dohResolver(async () => { throw new Error("down"); })("a")).toBeNull();
  });
});
