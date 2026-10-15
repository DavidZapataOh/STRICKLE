import { readFileSync } from "node:fs";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { parseOfac } from "../src/ofac.ts";

const excerpt = readFileSync(new URL("./fixtures/sdn-excerpt.xml", import.meta.url), "utf8");

describe("OFAC SDN parser", () => {
  it("reads the publication date and the EVM addresses of a real excerpt", () => {
    const { addresses, published } = parseOfac(excerpt);
    expect(published).toBe("10/14/2026");
    expect(addresses).toHaveLength(16);
    expect(addresses).toContain(getAddress("0x252a8bd2319d8a555b872990601221b3a2053bce"));
    expect(addresses).toContain(getAddress("0x1CAb8177ACe78b1B6B1c393371F4f2dCAE40CbEB"));
  });

  it("returns checksummed, unique, sorted addresses", () => {
    const { addresses } = parseOfac(excerpt);
    expect(addresses.every((address) => address === getAddress(address))).toBe(true);
    expect(new Set(addresses).size).toBe(addresses.length);
    expect([...addresses].sort()).toEqual(addresses);
  });

  it("ignores addresses of other chains", () => {
    const { addresses } = parseOfac(excerpt);
    expect(addresses.every((address) => /^0x[0-9a-fA-F]{40}$/.test(address))).toBe(true);
    expect(excerpt).toMatch(/Digital Currency Address - XBT/);
    expect(excerpt).toMatch(/Digital Currency Address - TRX/);
  });

  it("deduplicates an address that appears twice, in any letter case", () => {
    const doubled = excerpt.replace(
      "</sdnList>",
      "<sdnEntry><uid>1</uid><idList><id><uid>2</uid><idType>Digital Currency Address - ETH</idType><idNumber>0x252A8BD2319D8A555B872990601221B3A2053BCE</idNumber></id></idList></sdnEntry></sdnList>",
    );
    expect(parseOfac(doubled).addresses).toHaveLength(16);
  });

  it("skips malformed address values and entries without a number", () => {
    const noisy = excerpt.replace(
      "</sdnList>",
      "<sdnEntry><idList><id><idType>Digital Currency Address - ETH</idType><idNumber>0x1234</idNumber></id><id><idType>Digital Currency Address - ETH</idType></id><id><idType>Digital Currency Address - ETH</idType><idNumber>0xZZ9a8bd2319d8a555b872990601221b3a2053bce</idNumber></id></idList></sdnEntry></sdnList>",
    );
    expect(parseOfac(noisy).addresses).toHaveLength(16);
  });

  it("refuses a document that is not an SDN list", () => {
    expect(() => parseOfac("<html></html>")).toThrow(/SDN/);
    expect(() => parseOfac("")).toThrow(/SDN/);
  });

  it("refuses a list that claims to be an SDN list but has no publication date", () => {
    expect(() => parseOfac(excerpt.replace(/<Publish_Date>.*?<\/Publish_Date>/, ""))).toThrow(/publication date/);
  });
});
