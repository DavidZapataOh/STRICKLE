import { checkProof, isPlatform } from "@/server/reclaim";


export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { platform?: unknown; proof?: unknown } | null;
  if (!body || !isPlatform(body.platform) || typeof body.proof !== "object" || body.proof === null) return Response.json({ error: "bad-request" }, { status: 400 });
  try {
    const result = await checkProof(body.platform, body.proof as never);
    return Response.json(result, { status: result.ok ? 200 : 422, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 422 });
  }
}
