import { NextResponse, type NextRequest } from "next/server";
import { NEXT_COOKIE, accessMode, decide, isApiPath, readAccess, type SessionState } from "@/server/access";
import { localeRedirect } from "@/proxy-locale";
import { sessionChecker } from "@/server/db";

export async function proxy(request: NextRequest, options: { env?: Record<string, string | undefined>; checker?: { state(sid: string): Promise<"active" | "revoked" | "unknown"> } } = {}) {
  const { pathname, search } = request.nextUrl;
  if (!isApiPath(pathname)) {
    const redirect = localeRedirect(request);
    if (redirect) return redirect;
  }
  const env = options.env ?? process.env;
  const mode = accessMode(env);
  let session: SessionState = "missing";
  if (mode === "invite") {
    const cookie = request.cookies.get("strickle_access")?.value;
    const parsed = readAccess(env.ACCESS_COOKIE_SECRET ?? "", cookie, Math.floor(Date.now() / 1000));
    session = !cookie ? "missing" : !parsed ? "invalid" : await (options.checker ?? sessionChecker()).state(parsed.sid);
  }
  const decision = decide({ pathname, mode, session });
  if (decision.kind === "allow") return;
  if (decision.kind === "api") return NextResponse.json({ error: decision.error }, { status: decision.status, headers: { "cache-control": "no-store" } });
  const lang = pathname.split("/")[1] ?? "en";
  const response = NextResponse.redirect(new URL(`/${lang}/${decision.page}`, request.url));
  if (decision.page === "access" && request.method === "GET") response.cookies.set(NEXT_COOKIE, `${pathname}${search}`, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return response;
}

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
