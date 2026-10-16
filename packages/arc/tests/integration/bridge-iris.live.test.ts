import { describe, expect, it } from "vitest";
import { fetchBurnMessage } from "../../src/bridge/iris.ts";

describe("Iris sandbox", () => {
  it("returns null for a burn it has not indexed, the answer a fresh burn gets first", async () => {
    expect(await fetchBurnMessage("testnet", 6, `0x${"00".repeat(31)}01`)).toBeNull();
  });
});
