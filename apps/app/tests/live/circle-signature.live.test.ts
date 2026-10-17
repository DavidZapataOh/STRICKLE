import { createPublicKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SANDBOX } from "../../src/onramp/environment.ts";
import { circlePublicKeyLookup } from "../../src/server/circle-signature.ts";

const apiKey = process.env.ONRAMP_API_KEY;
const keyId = process.env.ONRAMP_KEY_ID;

// Needs the sandbox key and the key id from the first delivered notification (its x-circle-key-id header).
describe.skipIf(!apiKey || !keyId)("Circle's notification key endpoint", () => {
  it("serves a P-256 public key in the format the verifier reads", async () => {
    const lookup = circlePublicKeyLookup({ apiBaseUrl: SANDBOX.api, apiKey: apiKey as string });
    const key = createPublicKey({ key: Buffer.from(await lookup(keyId as string), "base64"), format: "der", type: "spki" });
    expect(key.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
  });
});
