import { sessionActive } from "@strickle/db/access";
import { connect } from "@strickle/db/connect";
import { createLimiter } from "@strickle/db/limiter";
import type { Sql } from "postgres";
import { type SessionChecker, createSessionChecker } from "./access.ts";

let shared: Sql | undefined;

/** One connection per server instance, with TLS and the pooler's settings taken from the URL; a missing URL is an error, never a fallback. */
export function sql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  shared ??= connect(url);
  return shared;
}

let limiter: ReturnType<typeof createLimiter> | undefined;

/** Without DATABASE_URL there is no limiter and the callers fail closed. */
export function relayLimiter(): ReturnType<typeof createLimiter> | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  limiter ??= createLimiter(sql());
  return limiter;
}

let checker: SessionChecker | undefined;

export function sessionChecker(): SessionChecker {
  checker ??= createSessionChecker(process.env.DATABASE_URL ? (sid) => sessionActive(sql(), sid, new Date()) : undefined);
  return checker;
}
