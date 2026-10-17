import { handleOwnerSession } from "@/server/owner-session";
import { ownerSessionDeps } from "@/server/payment-deps";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function POST(request: Request): Promise<Response> {
  const deps = ownerSessionDeps();
  if (!deps) return misconfigured();
  const result = await handleOwnerSession(request, deps);
  return payReply(result.body, result.status, result.cookie ? { "set-cookie": result.cookie.header } : {});
}
