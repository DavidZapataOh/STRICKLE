import { depositDeps } from "@/server/deposit-deps";
import { handleDepositRead, handleDepositUpdate } from "@/server/deposits";
import { reply } from "@/server/deposit-reply";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const deps = depositDeps();
  if (!deps) return reply({ status: "misconfigured" }, 503);
  const result = await handleDepositUpdate(request, (await params).id, deps);
  return reply(result.body, result.status);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const deps = depositDeps();
  if (!deps) return reply({ status: "misconfigured" }, 503);
  const result = await handleDepositRead(request, (await params).id, deps);
  return reply(result.body, result.status);
}
