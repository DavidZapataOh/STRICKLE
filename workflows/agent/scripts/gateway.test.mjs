// workflows/agent/scripts/gateway.test.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createJwt, sortedStringify } from "./gateway.mjs";

const privateKey = `0x${"02".repeat(32)}`;
const request = { jsonrpc: "2.0", id: "req-1", method: "workflows.execute", params: { input: { b: 2, a: { z: 1, y: 2 } }, workflow: { workflowID: "ab".repeat(32) } } };

test("sortedStringify sorts keys at every level", () => {
  assert.equal(sortedStringify({ b: 1, a: { d: 1, c: [{ y: 1, x: 2 }] } }), '{"a":{"c":[{"x":2,"y":1}],"d":1},"b":1}');
});

test("the JWT follows the gateway's format", async () => {
  const jwt = await createJwt(request, privateKey);
  const [header, payload, signature] = jwt.split(".");
  const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  assert.deepEqual(decode(header), { alg: "ETH", typ: "JWT" });
  const body = decode(payload);
  assert.equal(body.digest, `0x${createHash("sha256").update(sortedStringify(request)).digest("hex")}`);
  assert.equal(body.iss, privateKeyToAccount(privateKey).address);
  assert.ok(body.exp - body.iat <= 300 && body.exp > body.iat);
  assert.match(body.jti, /^[0-9a-f-]{36}$/);
  const bytes = Buffer.from(signature, "base64url");
  assert.equal(bytes.length, 65);
  assert.ok(bytes[64] === 0 || bytes[64] === 1);
  const asEthereum = `0x${bytes.subarray(0, 64).toString("hex")}${(bytes[64] + 27).toString(16)}`;
  assert.equal(await recoverMessageAddress({ message: `${header}.${payload}`, signature: asEthereum }), privateKeyToAccount(privateKey).address);
});
