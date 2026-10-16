import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createJwt, sortedStringify } from "@strickle/agent/gateway";
import { openNotice } from "@strickle/agent/notices";
import { noticeSchema } from "@strickle/agent/notice-schema";
import { proposalDigest } from "@strickle/agent/proposals";
import { actionDigest } from "@strickle/agent/signed";

const privateKey = `0x${"02".repeat(32)}` as const;

describe("the enclave package from the app", () => {
  it("signs a gateway JWT the way the gateway expects", async () => {
    const request = { jsonrpc: "2.0", id: "1", method: "workflows.execute", params: { input: { b: 2, a: 1 }, workflow: { workflowID: "ab".repeat(32) } } };
    const jwt = await createJwt(request, privateKey);
    const [header, payload, signature] = jwt.split(".");
    const body = JSON.parse(Buffer.from(payload as string, "base64url").toString("utf8"));
    expect(JSON.parse(Buffer.from(header as string, "base64url").toString("utf8"))).toEqual({ alg: "ETH", typ: "JWT" });
    expect(body.iss).toBe(privateKeyToAccount(privateKey).address);
    expect(body.digest).toBe(`0x${createHash("sha256").update(sortedStringify(request)).digest("hex")}`);
    expect(Buffer.from(signature as string, "base64url")).toHaveLength(65);
  });

  it("exposes the signed-request, notice and proposal modules to the browser build", () => {
    expect(typeof actionDigest).toBe("function");
    expect(typeof openNotice).toBe("function");
    expect(noticeSchema.safeParse({ kind: "decision", proposalId: "p-1", status: "executed" }).success).toBe(true);
    expect(proposalDigest({ payee: "0x00000000000000000000000000000000000000b2", amount: "1", month: "2026-11" })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
