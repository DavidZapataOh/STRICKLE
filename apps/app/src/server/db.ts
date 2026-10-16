import { sessionActive } from "@strickle/db/access";
import { createLimiter } from "@strickle/db/limiter";
import postgres, { type Sql } from "postgres";
import { createSessionChecker } from "./access.ts";

let client: Sql | undefined;
let limiter: ReturnType<typeof createLimiter> | undefined;
let checker: ReturnType<typeof createSessionChecker> | undefined;

/** One small pool per server instance; a pooled connection URL is expected in production. */
export function sql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  client ??= postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 10 });
  return client;
}

/** Without DATABASE_URL there is no limiter and the relay fails closed. */
export function relayLimiter(): ReturnType<typeof createLimiter> | undefined {
  if (!process.env.DATABASE_URL) return undefined;
  limiter ??= createLimiter(sql());
  return limiter;
}

/** Whether a session is still welcome. Without a database nothing can be confirmed, so every session reads as unknown and the gate fails closed. */
export function sessionChecker(): ReturnType<typeof createSessionChecker> {
  checker ??= createSessionChecker(process.env.DATABASE_URL ? (sid) => sessionActive(sql(), sid, new Date()) : undefined);
  return checker;
}
