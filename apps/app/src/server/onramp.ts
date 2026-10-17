import { attachCircleSession, createOnrampSessionRow, findOnrampSession } from "@strickle/db/onramp";
import { getLinkByToken } from "@strickle/db/payments";
import { createHash } from "node:crypto";
import type { Address } from "viem";
import { type OnrampConfig, assetScope, destinationChain } from "../onramp/environment.ts";
import type { PayDeps } from "./pay.ts";

export interface MintedSession {
  sessionId: string;
  sessionToken: string;
  widgetUrl: string;
  expiresAt: string;
  destinationWallet?: string;
  /** The configured widget origin, for the browser kit to check the session's URL against: it comes from this server's configuration, never from the session itself. */
  widgetOrigin?: string;
}

export interface CardDeps extends PayDeps {
  onramp: OnrampConfig | null;
  /** The credentialed Circle call that creates a session. */
  mint(params: { appUserId: string; destinationAddress: Address; destinationChain: "Arc_Testnet" | "Arc"; assets: ReturnType<typeof assetScope>; amount?: string }): Promise<MintedSession>;
}

type Failure = "not-found" | "closed" | "unavailable" | "rate-limited" | "rejected" | "misconfigured";
type CardResult = { status: "session"; session: MintedSession } | { status: Failure; retryAfterSeconds?: number };

const STATUS: Record<CardResult["status"], number> = { session: 201, "not-found": 404, closed: 409, unavailable: 502, "rate-limited": 429, rejected: 400, misconfigured: 503 };
const done = (body: CardResult) => ({ status: STATUS[body.status], body });

const clientIp = (request: Request): string => (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
const keyed = (scope: string, pepper: string, value: string) => `${scope}:${createHash("sha256").update(`${pepper}:${value}`).digest("hex")}`;

/** A session is minted from the link alone: the vault, the chain and the assets never come from the request, and no amount is pre-filled (what a fiat pre-fill means is not documented, and a wrong one would mislead the payer about what they pay). */
export async function handleCardSession(request: Request, token: string, deps: CardDeps): Promise<{ status: number; body: CardResult }> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return done({ status: "rejected" });
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return done({ status: "misconfigured" });
  if (!deps.onramp) return { status: 503, body: { status: "unavailable" } };
  let rowId: string | undefined;
  try {
    const ip = await deps.limiter.count(keyed("card-ip", pepper, clientIp(request)), 60, 5);
    if (!ip.allowed) return done({ status: "rate-limited", retryAfterSeconds: ip.retryAfterSeconds });
    const link = await getLinkByToken(deps.sql, deps.keys, token);
    if (!link) return done({ status: "not-found" });
    if (link.status === "paid" || link.status === "void" || link.revoked || (link.expiresAt !== null && link.expiresAt.getTime() < Date.now())) return done({ status: "closed" });
    const perLink = await deps.limiter.count(`card-link:${link.linkId}`, 3_600, 10);
    if (!perLink.allowed) return done({ status: "rate-limited", retryAfterSeconds: perLink.retryAfterSeconds });
    rowId = await createOnrampSessionRow(deps.sql, { linkId: link.linkId, vault: link.vault, expiresAt: new Date(Date.now() + 1_800_000) });
    const minted = await deps.mint({ appUserId: rowId, destinationAddress: link.vault as Address, destinationChain: destinationChain(deps.network), assets: assetScope(deps.network) });
    await attachCircleSession(deps.sql, rowId, minted.sessionId);
    return done({ status: "session", session: { sessionId: minted.sessionId, sessionToken: minted.sessionToken, widgetUrl: minted.widgetUrl, expiresAt: minted.expiresAt, ...(minted.destinationWallet ? { destinationWallet: minted.destinationWallet } : {}), widgetOrigin: deps.onramp.widgetOrigin } });
  } catch {
    // no half-made session is left behind: a row without a Circle session would only be noise in the open list
    if (rowId) await deps.sql`delete from onramp_sessions where id = ${rowId} and circle_session_id is null`.catch(() => undefined);
    return done({ status: "unavailable" });
  }
}

export async function handleCardStatus(request: Request, token: string, sessionId: string, deps: CardDeps): Promise<{ status: number; body: { status: "ok"; state: "minted" | "settled" } | { status: "not-found" } }> {
  const pepper = deps.env.RELAY_IP_PEPPER;
  const notFound = { status: 404, body: { status: "not-found" as const } };
  if (!pepper) return notFound;
  try {
    const ip = await deps.limiter.count(keyed("card-status-ip", pepper, clientIp(request)), 60, 60);
    if (!ip.allowed) return notFound;
    const link = await getLinkByToken(deps.sql, deps.keys, token);
    if (!link) return notFound;
    const row = await findOnrampSession(deps.sql, { circleSessionId: sessionId });
    if (!row || row.linkId !== link.linkId) return notFound;
    return { status: 200, body: { status: "ok", state: row.status === "settled" ? "settled" : "minted" } };
  } catch {
    return notFound;
  }
}
