import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { POOL_PAGE_SIZE, buildPoolUpstream } from "../src/app/api/pool-notes/upstream.ts";

describe("buildPoolUpstream", () => {
  it("asks the explorer only for the pool's NotesInserted logs from the first block", () => {
    const url = new URL(buildPoolUpstream("0x00000000000000000000000000000000000000cc", "secret-key", "https://explorer.example/api"));
    expect(url.searchParams.get("module")).toBe("logs");
    expect(url.searchParams.get("address")).toBe("0x00000000000000000000000000000000000000cc");
    expect(url.searchParams.get("topic0")).toBe(keccak256(toBytes("NotesInserted(uint32,uint256,uint256,bytes)")));
    expect(url.searchParams.get("fromBlock")).toBe("0");
    expect(url.searchParams.get("apikey")).toBe("secret-key");
  });

  it("pages through the logs one fixed-size page at a time", () => {
    const url = new URL(buildPoolUpstream("0x00000000000000000000000000000000000000cc", undefined, "https://explorer.example/api", 3));
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("offset")).toBe(String(POOL_PAGE_SIZE));
  });

  it("works without a key", () => {
    expect(new URL(buildPoolUpstream("0x00000000000000000000000000000000000000cc", undefined, "https://explorer.example/api")).searchParams.has("apikey")).toBe(false);
  });
});
