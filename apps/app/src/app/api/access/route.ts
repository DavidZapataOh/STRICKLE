import { redeemInviteWithSession } from "@strickle/db/access";
import { handleAccess } from "@/server/access-handler";
import { relayLimiter, sql } from "@/server/db";

export const POST = (request: Request) =>
  handleAccess(request, {
    env: process.env,
    now: Math.floor(Date.now() / 1000),
    redeem: (code, session) => redeemInviteWithSession(sql(), code, session),
    attempts: relayLimiter(),
  });
