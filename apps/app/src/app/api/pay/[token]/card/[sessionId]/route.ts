import { cardDeps } from "@/server/payment-deps";
import { handleCardStatus } from "@/server/onramp";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function GET(request: Request, { params }: { params: Promise<{ token: string; sessionId: string }> }): Promise<Response> {
  const deps = cardDeps();
  if (!deps) return misconfigured();
  const { token, sessionId } = await params;
  const result = await handleCardStatus(request, token, sessionId, deps);
  return payReply(result.body, result.status);
}
