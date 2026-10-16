// workflows/agent/tests/enclave-guard.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../enclave/", import.meta.url);
const sources = readdirSync(dir).map((name) => [name, readFileSync(new URL(name, dir), "utf8")] as const);
const outsideDeliver = sources.filter(([name]) => name !== "deliver.ts");

describe("enclave sources", () => {
  it.each(sources)("%s never logs", (_name, source) => {
    expect(source).not.toMatch(/\.log\(|console\./);
  });

  it.each(outsideDeliver)("%s never touches the chain-read capability or a random generator", (_name, source) => {
    expect(source).not.toMatch(/EVMClient|callContract|randomBytes|Math\.random|getRandomValues/);
  });

  it("only deliver.ts leaves the enclave", () => {
    for (const [, source] of outsideDeliver) expect(source).not.toContain("usingTheDons");
  });

  it("the handler fetches the master only through the secrets API and never returns it", () => {
    const handler = readFileSync(new URL("profile-handler.ts", dir), "utf8");
    expect(handler).toContain('getSecret({ id: "AGENT_MASTER" })');
    expect(handler).not.toMatch(/return[^;]*master/i);
  });

  it("the deposit handler caps the work per run and skips instead of failing a whole run", () => {
    const handler = readFileSync(new URL("deposit-handler.ts", dir), "utf8");
    expect(handler).toMatch(/MAX_PER_RUN\s*=\s*5/);
    expect(handler).toContain("catch");
  });

  it("the daily handler caps the work per run, picks the least recently updated vaults and skips instead of failing a run", () => {
    const handler = readFileSync(new URL("tick-handler.ts", dir), "utf8");
    expect(handler).toMatch(/MAX_PER_RUN\s*=\s*5/);
    expect(handler).toMatch(/sort\(/);
    expect(handler).toContain("catch");
  });

  it("the action handler checks the owner's signature, the nonce and the deadline before applying anything", () => {
    const handler = readFileSync(new URL("action-handler.ts", dir), "utf8");
    expect(handler.indexOf("actionDigest")).toBeGreaterThan(-1);
    expect(handler.indexOf("applyAction(")).toBeGreaterThan(handler.indexOf("erc1271Accepts("));
    expect(handler.indexOf("open(")).toBeLessThan(handler.indexOf("requestSchema.safeParse"));
    expect(handler).not.toMatch(/return `rejected/);
    expect(handler).toMatch(/nonce/);
    expect(handler).toMatch(/deadline/);
  });
});
