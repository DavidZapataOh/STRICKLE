import { type Proof, ReclaimProofRequest, verifyProof } from "@reclaimprotocol/js-sdk";
import providers from "@/config/reclaim.json";

export type Platform = keyof typeof providers;
export const isPlatform = (value: unknown): value is Platform => typeof value === "string" && Object.hasOwn(providers, value);

function credentials(): { appId: string; secret: string } {
  const appId = process.env.RECLAIM_APP_ID;
  const secret = process.env.RECLAIM_APP_SECRET;
  if (!appId || !secret) throw new Error("reclaim-not-configured");
  return { appId, secret };
}

/** A proof request for a platform: the link the person opens to sign in on the platform and the URL that reports the session. */
export async function startRequest(platform: Platform): Promise<{ requestUrl: string; statusUrl: string }> {
  const { appId, secret } = credentials();
  const request = await ReclaimProofRequest.init(appId, secret, providers[platform]);
  return { requestUrl: await request.getRequestUrl(), statusUrl: request.getStatusUrl() };
}

/** Checks a proof the person's session produced: the attestors' signatures and that its content is what this platform's provider defines. */
export async function checkProof(platform: Platform, proof: Proof | Proof[]): Promise<{ ok: true; claims: unknown[] } | { ok: false }> {
  const result = await verifyProof(proof, { providerId: providers[platform] });
  return result.isVerified ? { ok: true, claims: (Array.isArray(proof) ? proof : [proof]).map((entry) => entry.claimData.context) } : { ok: false };
}
