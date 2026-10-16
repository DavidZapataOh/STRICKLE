import { latestSnapshot } from "@strickle/db/snapshots";
import { appNetwork } from "@/config/network";
import type { Metrics } from "@/server/metrics";
import { sql } from "@/server/db";

export async function GET() {
  const snapshot = await latestSnapshot<Metrics>(sql(), appNetwork());
  if (!snapshot) return Response.json({ error: "no snapshot yet" }, { status: 404 });
  return Response.json({ ...snapshot.payload, takenAt: snapshot.takenAt.toISOString() }, { headers: { "cache-control": "public, s-maxage=60" } });
}
