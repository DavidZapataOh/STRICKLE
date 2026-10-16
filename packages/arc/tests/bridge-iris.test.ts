import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { irisBase, parseIrisMessages } from "../src/bridge/iris.ts";

const complete = JSON.parse(readFileSync(new URL("./fixtures/bridge/iris-complete.json", import.meta.url), "utf8"));

describe("parseIrisMessages", () => {
  it("reads a completed, forwarded transfer", () => {
    const [message] = parseIrisMessages(complete);
    expect(message?.status).toBe("complete");
    expect(message?.forwardState).toBe("COMPLETE");
    expect(message?.forwardTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(message?.destinationDomain).toBe(26);
    expect(message?.amount).toBe(BigInt(complete.messages[0].decodedMessage.decodedMessageBody.amount));
  });

  it("keeps a message that is still waiting for confirmations, without a forward hash", () => {
    const waiting = { messages: [{ ...complete.messages[0], status: "pending_confirmations", forwardState: null, forwardTxHash: null, attestation: "PENDING" }] };
    expect(parseIrisMessages(waiting)[0]).toMatchObject({ status: "pending_confirmations", forwardTxHash: null });
  });

  // iris-pending.json is a real answer for a burn that is still waiting; the funded live run (Step 9) saves it, until then this case is skipped
  it.skipIf(!existsSync(new URL("./fixtures/bridge/iris-pending.json", import.meta.url)))("keeps the real pending message captured from a live burn", () => {
    const pending = JSON.parse(readFileSync(new URL("./fixtures/bridge/iris-pending.json", import.meta.url), "utf8"));
    expect(parseIrisMessages(pending)[0]?.status).toBe("pending_confirmations");
  });

  it("rejects a body that is not a message list", () => {
    expect(() => parseIrisMessages({ nope: true })).toThrow();
  });
});

describe("the speed Iris applied", () => {
  it("is read from the finality threshold it executed: 1000 is fast, 2000 is standard", () => {
    const body = (threshold: string) => ({ messages: [{ ...complete.messages[0], decodedMessage: { ...complete.messages[0].decodedMessage, finalityThresholdExecuted: threshold } }] });
    expect(parseIrisMessages(body("1000"))[0]?.appliedSpeed).toBe("fast");
    expect(parseIrisMessages(body("2000"))[0]?.appliedSpeed).toBe("slow");
  });
  it("is unknown while the message is still pending and carries no decoded body yet", () => {
    const pending = { messages: [{ status: "pending_confirmations", message: "0x", attestation: "PENDING", eventNonce: "0x00", cctpVersion: 2, delayReason: null, forwardState: null, forwardTxHash: null }] };
    expect(parseIrisMessages(pending)[0]).toMatchObject({ status: "pending_confirmations", appliedSpeed: null, forwardTxHash: null });
  });
});

describe("irisBase", () => {
  it("uses the sandbox on testnet and the production service on mainnet", () => {
    expect(irisBase("testnet")).toBe("https://iris-api-sandbox.circle.com");
    expect(irisBase("mainnet")).toBe("https://iris-api.circle.com");
  });
});
