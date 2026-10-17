import { sharedPublicKeyLookup } from "@/server/circle-signature";
import { handleCircleWebhook } from "@/server/circle-webhook";
import { cardDeps } from "@/server/payment-deps";

export async function POST(request: Request): Promise<Response> {
  const deps = cardDeps();
  if (!deps?.onramp) return Response.json({ error: "misconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });
  const result = await handleCircleWebhook(request, { ...deps, lookup: sharedPublicKeyLookup({ apiBaseUrl: deps.onramp.apiBaseUrl, apiKey: deps.onramp.apiKey }) });
  return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}
