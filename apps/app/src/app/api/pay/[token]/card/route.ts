import { cardDeps } from "@/server/payment-deps";
import { handleCardSession } from "@/server/onramp";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const deps = cardDeps();
  if (!deps) return misconfigured();
  const result = await handleCardSession(request, (await params).token, deps);
  return payReply(result.body, result.status, "retryAfterSeconds" in result.body && result.body.retryAfterSeconds ? { "retry-after": String(result.body.retryAfterSeconds) } : {});
}
