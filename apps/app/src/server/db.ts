import "server-only";
import { createLimiter } from "@strickle/db";
import postgres from "postgres";

let limiter: ReturnType<typeof createLimiter> | undefined;

/** One small pool per server instance; a pooled connection URL is expected in production. Without DATABASE_URL there is no limiter and the relay fails closed. */
export function relayLimiter(): ReturnType<typeof createLimiter> | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  limiter ??= createLimiter(postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 10 }));
  return limiter;
}
