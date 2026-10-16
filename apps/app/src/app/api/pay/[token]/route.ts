import { paymentDeps } from "@/server/payment-deps";
import { handlePayView } from "@/server/pay";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const deps = paymentDeps();
  if (!deps) return misconfigured();
  const result = await handlePayView(request, (await params).token, deps);
  return payReply(result.body, result.status, result.body.status === "rate-limited" && result.body.retryAfterSeconds ? { "retry-after": String(result.body.retryAfterSeconds) } : {});
}
