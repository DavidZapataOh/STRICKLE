import { createHmac, timingSafeEqual } from "node:crypto";
import { defaultLocale, hasLocale } from "@strickle/design/locale";

export type AccessMode = "open" | "invite" | "closed";
export const ACCESS_COOKIE = "strickle_access";
export const NEXT_COOKIE = "strickle_next";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

export function accessMode(env: Record<string, string | undefined>): AccessMode {
  const raw = env.ACCESS_MODE;
  if (raw === "open" || raw === "invite" || raw === "closed") return raw;
  if (raw !== undefined) throw new Error(`ACCESS_MODE must be open, invite or closed, got ${raw}`);
  if (env.NEXT_PUBLIC_APP_NETWORK === "mainnet") throw new Error("ACCESS_MODE must be set explicitly on mainnet");
  return "open";
}

function secretOf(secret: string): string {
  if (secret.length < 32) throw new Error("the access cookie secret must be at least 32 characters");
  return secret;
}

const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const mac = (secret: string, sid: string, expiresAt: number) => createHmac("sha256", secretOf(secret)).update(`access:${sid}:${expiresAt}`).digest("hex");

export const mintAccess = (secret: string, sid: string, expiresAt: number): string => `${sid}.${expiresAt}.${mac(secret, sid, expiresAt)}`;

export function readAccess(secret: string, value: string | undefined, now: number): { sid: string; expiresAt: number } | undefined {
  if (!value) return undefined;
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  const [sid, expires, given] = parts as [string, string, string];
  const expiresAt = Number(expires);
  if (!SID.test(sid) || !Number.isInteger(expiresAt) || expiresAt < now) return undefined;
  const expected = Buffer.from(mac(secret, sid, expiresAt));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? { sid, expiresAt } : undefined;
}

const PUBLIC_PAGES = ["access", "closed", "unavailable", "verify", "docs", "metrics", "view", "accountant", "pay", "judges"];
const PUBLIC_API = ["/api/access", "/api/metrics", "/api/logs", "/api/pool-notes", "/api/webhooks/circle"];

export const isApiPath = (pathname: string): boolean => pathname === "/api" || pathname.startsWith("/api/");

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_API.includes(pathname)) return true;
  // the payer a freelancer sent a link to has no invite, and a payment cannot be refused on chain anyway; the segment match keeps /api/payroll closed
  if (pathname.startsWith("/api/pay/")) return true;
  const [, lang, page] = pathname.split("/");
  return lang !== undefined && hasLocale(lang) && page !== undefined && PUBLIC_PAGES.includes(page);
}

/** Where a visitor goes after redeeming a code: a local page of their own language, never the access page, never anything that could leave the site. */
export function safeNext(value: string | undefined, lang: string): string {
  const fallback = `/${hasLocale(lang) ? lang : defaultLocale}`;
  if (!value || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  const [, first, second] = value.split("?")[0]?.split("/") ?? [];
  if (first === undefined || !hasLocale(first) || first !== lang || second === "access") return fallback;
  return value;
}

export type SessionState = "active" | "missing" | "invalid" | "revoked" | "unknown";
export type Decision =
  | { kind: "allow" }
  | { kind: "redirect"; page: "access"; remember: true }
  | { kind: "redirect"; page: "closed" }
  | { kind: "api"; status: 401 | 503; error: "access-required" | "closed" | "unavailable" };

export function decide(input: { pathname: string; mode: AccessMode; session: SessionState }): Decision {
  const { pathname, mode, session } = input;
  if (mode === "open" || isPublicPath(pathname)) return { kind: "allow" };
  const api = isApiPath(pathname);
  if (mode === "closed") return api ? { kind: "api", status: 503, error: "closed" } : { kind: "redirect", page: "closed" };
  if (session === "active") return { kind: "allow" };
  if (session === "unknown") return api ? { kind: "api", status: 503, error: "unavailable" } : { kind: "redirect", page: "closed" };
  return api ? { kind: "api", status: 401, error: "access-required" } : { kind: "redirect", page: "access", remember: true };
}

export interface SessionChecker {
  state(sid: string): Promise<"active" | "revoked" | "unknown">;
}

/**
 * The cookie proves who the visitor is without the database; the database says whether that session is still welcome.
 * Answers are cached briefly, the last one survives a database outage for a few minutes, and after that the gate fails closed.
 */
export function createSessionChecker(
  active: ((sid: string) => Promise<boolean>) | undefined,
  options: { ttlMs?: number; staleMs?: number; now?: () => number } = {},
): SessionChecker {
  const ttlMs = options.ttlMs ?? 30_000;
  const staleMs = options.staleMs ?? 300_000;
  const now = options.now ?? Date.now;
  const seen = new Map<string, { value: "active" | "revoked"; at: number }>();
  return {
    async state(sid) {
      if (!active) return "unknown";
      const cached = seen.get(sid);
      if (cached && now() - cached.at < ttlMs) return cached.value;
      try {
        const value = (await active(sid)) ? "active" : "revoked";
        seen.set(sid, { value, at: now() });
        return value;
      } catch {
        return cached && now() - cached.at < staleMs ? cached.value : "unknown";
      }
    },
  };
}
