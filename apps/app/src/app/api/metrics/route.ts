import { latestSnapshot } from "@strickle/db/snapshots";
import { connection } from "next/server";
import { appNetwork } from "@/config/network";
import type { Metrics } from "@/server/metrics";
import { sql } from "@/server/db";

export async function GET() {
  // the latest snapshot is read at request time, never while the app is built
  await connection();
  let snapshot: Awaited<ReturnType<typeof latestSnapshot<Metrics>>>;
  try {
    snapshot = await latestSnapshot<Metrics>(sql(), appNetwork());
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!snapshot) return Response.json({ error: "no snapshot yet" }, { status: 404 });
  return Response.json({ ...snapshot.payload, takenAt: snapshot.takenAt.toISOString() }, { headers: { "cache-control": "public, s-maxage=60" } });
}
