// workflows/agent/tests/rpc.test.ts
import { describe, expect, it } from "vitest";
import { batchBody, callRequest, codeRequest, decodeOwner, decodeVaultOf, firstLogData, isContract, logsRangeRequest, logsRequest, ownerRequest, parseBatch, topic, vaultOfRequest } from "../enclave/rpc.ts";

const to = "0x00000000000000000000000000000000000000aa";
const decode = (body: string) => JSON.parse(Buffer.from(body, "base64").toString("utf8"));

describe("requests", () => {
  it("builds an eth_call at a block or at latest", () => {
    expect(callRequest(to, "0x1234", 255n)).toEqual({ method: "eth_call", params: [{ to, data: "0x1234" }, "0xff"] });
    expect(callRequest(to, "0x1234", "latest").params[1]).toBe("latest");
  });

  it("builds an eth_getLogs for exactly one block", () => {
    const topics = [topic(1n)];
    expect(logsRequest(to, 16n, topics)).toEqual({ method: "eth_getLogs", params: [{ address: to, fromBlock: "0x10", toBlock: "0x10", topics }] });
  });

  it("pads addresses and numbers to 32 bytes", () => {
    expect(topic(to)).toBe(`0x${"0".repeat(24)}${to.slice(2)}`);
    expect(topic(3n)).toBe(`0x${"0".repeat(63)}3`);
  });
});

describe("batchBody", () => {
  it("is base64 of one JSON array with a distinct id per request", () => {
    const body = decode(batchBody([callRequest(to, "0x01", "latest"), logsRequest(to, 1n, [])]));
    expect(body.map((request: { id: number; method: string }) => [request.id, request.method])).toEqual([[1, "eth_call"], [2, "eth_getLogs"]]);
    expect(body[0].jsonrpc).toBe("2.0");
  });
});

describe("batch size", () => {
  it("refuses more calls than one request may carry", () => {
    const many = Array.from({ length: 101 }, () => callRequest(to, "0x01", "latest"));
    expect(() => batchBody(many)).toThrow(/^batch too large$/);
    expect(() => batchBody(many.slice(0, 100))).not.toThrow();
  });
});

describe("parseBatch", () => {
  it("returns results in request order even when the node answers out of order", () => {
    const text = JSON.stringify([
      { jsonrpc: "2.0", id: 2, result: "0x02" },
      { jsonrpc: "2.0", id: 1, result: "0x01" },
    ]);
    expect(parseBatch(text, 2)).toEqual(["0x01", "0x02"]);
  });

  it("refuses when any member failed, without repeating its text", () => {
    const text = JSON.stringify([
      { jsonrpc: "2.0", id: 1, result: "0x01" },
      { jsonrpc: "2.0", id: 2, error: { code: -32000, message: "leaky detail" } },
    ]);
    expect(() => parseBatch(text, 2)).toThrow(/^rpc error$/);
  });

  it("refuses a short answer, a non-array answer and garbage", () => {
    expect(() => parseBatch(JSON.stringify([{ id: 1, result: "0x01" }]), 2)).toThrow(/^rpc error$/);
    expect(() => parseBatch("{}", 1)).toThrow(/^rpc error$/);
    expect(() => parseBatch("not json", 1)).toThrow(/^rpc error$/);
  });
});

describe("vault lookups", () => {
  const owner = "0x00000000000000000000000000000000000000bb";

  it("reads owner() and decodes it", () => {
    expect(ownerRequest(to)).toMatchObject({ method: "eth_call", params: [{ to }, "latest"] });
    expect(decodeOwner(`0x${"0".repeat(24)}${owner.slice(2)}`).toLowerCase()).toBe(owner);
  });

  it("reads vaultOf(owner) from the factory and decodes it", () => {
    expect(vaultOfRequest(to, owner)).toMatchObject({ method: "eth_call", params: [{ to }, "latest"] });
    expect(decodeVaultOf(`0x${"0".repeat(24)}${to.slice(2)}`).toLowerCase()).toBe(to);
  });
});

describe("firstLogData", () => {
  it("returns the data of the first log", () => {
    expect(firstLogData([{ data: "0xabcd", topics: [] }, { data: "0x00", topics: [] }])).toBe("0xabcd");
  });

  it("refuses an empty or malformed result", () => {
    expect(() => firstLogData([])).toThrow(/^no log$/);
    expect(() => firstLogData("0x")).toThrow(/^no log$/);
  });
});

describe("code", () => {
  it("asks for the code at latest and tells contracts from plain addresses", () => {
    expect(codeRequest(to)).toEqual({ method: "eth_getCode", params: [to, "latest"] });
    expect(isContract("0x6080")).toBe(true);
    expect(isContract("0x")).toBe(false);
  });
});

describe("logsRangeRequest", () => {
  it("asks a block range, with an optional address and topics that may be alternatives", () => {
    const request = logsRangeRequest(to, 100n, 200n, [topic(1n), null, [topic(2n), topic(3n)]]);
    expect(request.method).toBe("eth_getLogs");
    expect(request.params).toEqual([{ address: to, fromBlock: "0x64", toBlock: "0xc8", topics: [topic(1n), null, [topic(2n), topic(3n)]] }]);
    expect((logsRangeRequest(undefined, 1n, 2n, []).params[0] as { address?: string }).address).toBeUndefined();
  });
});
