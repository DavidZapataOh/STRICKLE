import { isPlatform, startRequest } from "@/server/reclaim";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const platform = new URL(request.url).searchParams.get("platform");
  if (!isPlatform(platform)) return Response.json({ error: "unknown-platform" }, { status: 400 });
  try {
    return Response.json(await startRequest(platform), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
