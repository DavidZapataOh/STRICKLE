import { handleInvoiceAction } from "@/server/invoices";
import { paymentDeps } from "@/server/payment-deps";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const deps = paymentDeps();
  if (!deps) return misconfigured();
  const result = await handleInvoiceAction(request, (await params).id, deps);
  return payReply(result.body, result.status);
}
