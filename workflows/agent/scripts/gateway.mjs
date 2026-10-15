// workflows/agent/scripts/gateway.mjs
import { createHash, randomUUID } from "node:crypto";
import { parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const sortedStringify = (value) => {
  const sorted = (inner) =>
    Array.isArray(inner)
      ? inner.map(sorted)
      : inner !== null && typeof inner === "object"
        ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, item]) => [key, sorted(item)]))
        : inner;
  return JSON.stringify(sorted(value));
};

export async function createJwt(request, privateKey) {
  const account = privateKeyToAccount(privateKey);
  const now = Math.floor(Date.now() / 1000);
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = part({ alg: "ETH", typ: "JWT" });
  const payload = part({ digest: `0x${createHash("sha256").update(sortedStringify(request)).digest("hex")}`, iss: account.address, iat: now, exp: now + 300, jti: randomUUID() });
  const { r, s, v, yParity } = parseSignature(await account.signMessage({ message: `${header}.${payload}` }));
  const recovery = v !== undefined ? (v >= 27n ? v - 27n : v) : yParity;
  const bytes = Buffer.concat([Buffer.from(r.slice(2).padStart(64, "0"), "hex"), Buffer.from(s.slice(2).padStart(64, "0"), "hex"), Buffer.from([Number(recovery)])]);
  return `${header}.${payload}.${bytes.toString("base64url")}`;
}

export async function triggerWorkflow({ url, workflowId, input, privateKey }) {
  const request = { jsonrpc: "2.0", id: randomUUID(), method: "workflows.execute", params: { input, workflow: { workflowID: workflowId.replace(/^0x/, "") } } };
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await createJwt(request, privateKey)}` }, body: JSON.stringify(request) });
  return response.json();
}
