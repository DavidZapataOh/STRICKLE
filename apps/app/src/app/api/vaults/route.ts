import { connection } from "next/server";
import { appNetwork } from "@/config/network";
import { vaultsAnswer } from "@/yield/handler";

export async function GET() {
  await connection();
  const { body, cacheable } = await vaultsAnswer(appNetwork());
  return Response.json(body, { headers: { "cache-control": cacheable ? "public, s-maxage=60" : "no-store" } });
}
