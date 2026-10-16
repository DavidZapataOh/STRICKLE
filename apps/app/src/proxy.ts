import { NextResponse, type NextRequest } from "next/server";
import { locales, resolveLocale } from "@strickle/design/locale";

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) return;
  if (locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;
  const locale = resolveLocale(searchParams.get("lang"), request.headers.get("accept-language"));
  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

// API routes answer where they are: a locale prefix would turn them into 404s.
export const config = { matcher: ["/((?!api(?:/|$)|_next|.*\\..*).*)"] };
