import { depositDeps } from "@/server/deposit-deps";
import { paymentDeps } from "@/server/payment-deps";
import { handlePayDeposit } from "@/server/pay";
import { misconfigured, payReply } from "@/server/pay-reply";

type Params = { params: Promise<{ token: string; id: string }> };

async function run(kind: "update" | "read", request: Request, { params }: Params): Promise<Response> {
  const pay = paymentDeps();
  const deposit = depositDeps();
  if (!pay || !deposit) return misconfigured();
  const { token, id } = await params;
  const result = await handlePayDeposit(request, token, { ...deposit, ...pay }, { kind, id });
  return payReply(result.body, result.status);
}

export const GET = (request: Request, context: Params) => run("read", request, context);
export const POST = (request: Request, context: Params) => run("update", request, context);
