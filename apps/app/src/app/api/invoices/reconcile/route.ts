import { handleReconcile } from "@/server/invoices";
import { paymentDeps } from "@/server/payment-deps";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function POST(request: Request): Promise<Response> {
  const deps = paymentDeps();
  if (!deps) return misconfigured();
  const result = await handleReconcile(request, deps);
  return payReply(result.body, result.status);
}
