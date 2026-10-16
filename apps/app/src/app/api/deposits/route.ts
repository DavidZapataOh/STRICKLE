import { depositDeps } from "@/server/deposit-deps";
import { handleCreateDeposit } from "@/server/deposits";
import { reply } from "@/server/deposit-reply";

export async function POST(request: Request): Promise<Response> {
  const deps = depositDeps();
  if (!deps) return reply({ status: "misconfigured" }, 503);
  const result = await handleCreateDeposit(request, deps);
  return reply(result.body, result.status);
}
