import { createHash, randomUUID } from "node:crypto";
import { defaultLocale, hasLocale } from "@strickle/design/locale";
import { ACCESS_COOKIE, NEXT_COOKIE, SESSION_SECONDS, accessMode, mintAccess, safeNext } from "./access.ts";
import { cookieValue } from "./cookie-gate.ts";

export interface AccessDeps {
  env: Record<string, string | undefined>;
  now: number;
  redeem(code: string, session: { sid: string; expiresAt: Date }): Promise<boolean>;
  attempts?: { count(key: string, windowSeconds: number, limit: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> };
  randomId?: () => string;
}

const ATTEMPTS = 10;
const WINDOW_SECONDS = 600;

function decodedCookie(header: string | null, name: string): string | undefined {
  const raw = cookieValue(header, name);
  if (raw === undefined) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

export async function handleAccess(request: Request, deps: AccessDeps): Promise<Response> {
  const form = await request.formData().catch(() => new FormData());
  const langField = String(form.get("lang") ?? "");
  const lang = hasLocale(langField) ? langField : defaultLocale;
  const to = (path: string, extra?: Headers) => {
    const headers = new Headers(extra);
    headers.set("location", new URL(path, request.url).toString());
    return new Response(null, { status: 303, headers });
  };
  const mode = accessMode(deps.env);
  if (mode === "closed") return to(`/${lang}/closed`);
  if (mode === "open") return to(`/${lang}`);

  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return to(`/${lang}/access/error`);
  if (deps.attempts) {
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
    const key = `access:${createHash("sha256").update(`${pepper}:${ip}`).digest("hex")}`;
    if (!(await deps.attempts.count(key, WINDOW_SECONDS, ATTEMPTS)).allowed) return to(`/${lang}/access/slow`);
  }

  // The cookie is signed before the code is touched: a secret that cannot sign must never cost anyone their invitation.
  const sid = (deps.randomId ?? randomUUID)();
  const expiresAt = deps.now + SESSION_SECONDS;
  let value: string;
  try {
    value = mintAccess(deps.env.ACCESS_COOKIE_SECRET ?? "", sid, expiresAt);
  } catch {
    return to(`/${lang}/access/error`);
  }
  let accepted: boolean;
  try {
    accepted = await deps.redeem(String(form.get("code") ?? ""), { sid, expiresAt: new Date(expiresAt * 1000) });
  } catch {
    return to(`/${lang}/access/error`);
  }
  if (!accepted) return to(`/${lang}/access/invalid`);

  const next = safeNext(decodedCookie(request.headers.get("cookie"), NEXT_COOKIE), lang);
  const headers = new Headers();
  headers.append("set-cookie", `${ACCESS_COOKIE}=${value}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
  headers.append("set-cookie", `${NEXT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return to(next, headers);
}
