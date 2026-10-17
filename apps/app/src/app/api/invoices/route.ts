import { handleCreateInvoice, handleListInvoices } from "@/server/invoices";
import { paymentDeps } from "@/server/payment-deps";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function GET(request: Request): Promise<Response> {
  const deps = paymentDeps();
  if (!deps) return misconfigured();
  const result = await handleListInvoices(request, deps);
  return payReply(result.body, result.status);
}

export async function POST(request: Request): Promise<Response> {
  const deps = paymentDeps();
  if (!deps) return misconfigured();
  const result = await handleCreateInvoice(request, deps);
  return payReply(result.body, result.status);
}
