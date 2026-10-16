import type { AccessGate } from "./access-gate.ts";
import { ACCESS_COOKIE, type SessionChecker, accessMode, readAccess } from "./access.ts";

export const cookieValue = (header: string | null, name: string): string | undefined => {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
};

/** The relay's gate: the same rules as the proxy, for the one route that spends the gateway's budget. */
export function cookieGate(env: Record<string, string | undefined>, checker: SessionChecker, now: () => number = () => Math.floor(Date.now() / 1000)): AccessGate {
  return async (request) => {
    const mode = accessMode(env);
    if (mode === "open") return "allow";
    if (mode === "closed") return "closed";
    const session = readAccess(env.ACCESS_COOKIE_SECRET ?? "", cookieValue(request.headers.get("cookie"), ACCESS_COOKIE), now());
    return session && (await checker.state(session.sid)) === "active" ? "allow" : "deny";
  };
}
