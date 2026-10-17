import { depositDeps } from "@/server/deposit-deps";
import { paymentDeps } from "@/server/payment-deps";
import { handlePayDeposit } from "@/server/pay";
import { misconfigured, payReply } from "@/server/pay-reply";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const pay = paymentDeps();
  const deposit = depositDeps();
  if (!pay || !deposit) return misconfigured();
  const result = await handlePayDeposit(request, (await params).token, { ...deposit, ...pay }, { kind: "create" });
  return payReply(result.body, result.status);
}
