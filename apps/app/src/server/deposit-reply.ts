import type { DepositApiResult } from "@/server/deposits";

export const reply = (body: DepositApiResult, status: number): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...("retryAfterSeconds" in body && body.retryAfterSeconds ? { "retry-after": String(body.retryAfterSeconds) } : {}) } });
