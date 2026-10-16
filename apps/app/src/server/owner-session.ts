import { type InvoiceKeys } from "@strickle/db/invoice-keys";
import type { createLimiter } from "@strickle/db/limiter";
import { useNonce as spendNonce } from "@strickle/db/payments";
import type { ArcNetworkName } from "@strickle/arc/networks";
import { networks } from "@strickle/arc/networks";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "postgres";
import { type Address, type Hex, hashTypedData } from "viem";
import { z } from "zod";

export const OWNER_COOKIE = "strickle_owner";
export const OWNER_SESSION_SECONDS = 1800;
const MAX_DEADLINE_AHEAD = 300;
const MAX_BODY = 2_000;

export const ownerTypedData = (input: { chainId: number; vault: Address; nonce: bigint; deadline: number }) => ({
  domain: { name: "Strickle Invoices", version: "1", chainId: input.chainId, verifyingContract: input.vault },
  types: { OwnerSession: [{ name: "vault", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
  primaryType: "OwnerSession" as const,
  message: { vault: input.vault, nonce: input.nonce, deadline: BigInt(input.deadline) },
});

const mac = (keys: InvoiceKeys, vault: string, expiresAt: number) => createHmac("sha256", keys.session).update(`owner:${vault}:${expiresAt}`).digest("hex");

export function mintOwnerCookie(keys: InvoiceKeys, vault: Address, expiresAt: number): string {
  const normalized = vault.toLowerCase();
  return `${normalized}.${expiresAt}.${mac(keys, normalized, expiresAt)}`;
}

export function readOwnerCookie(keys: InvoiceKeys, value: string | undefined, now: number): { vault: Address; expiresAt: number } | undefined {
  const match = /^(0x[0-9a-f]{40})\.([0-9]{1,12})\.([0-9a-f]{64})$/.exec(value ?? "");
  if (!match) return undefined;
  const [, vault, expires, tag] = match as unknown as [string, Address, string, string];
  const expiresAt = Number(expires);
  const expected = Buffer.from(mac(keys, vault, expiresAt), "hex");
  const given = Buffer.from(tag, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  return expiresAt > now ? { vault, expiresAt } : undefined;
}

const cookieValue = (header: string | null): string | undefined => {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === OWNER_COOKIE) return rest.join("=");
  }
  return undefined;
};

/** The vault whose owner signed in, from the cookie; an unsafe method must also come from this app's own origin. */
export function requireOwner(request: Request, keys: InvoiceKeys, now: number = Math.floor(Date.now() / 1000)): Address | undefined {
  const session = readOwnerCookie(keys, cookieValue(request.headers.get("cookie")), now);
  if (!session) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return undefined;
  }
  return session.vault;
}

export interface OwnerSessionDeps {
  env: { RELAY_IP_PEPPER?: string };
  keys: InvoiceKeys;
  sql: Sql;
  limiter: Pick<ReturnType<typeof createLimiter>, "count">;
  chain: { ownerOf(vault: Address): Promise<Address>; accepts(owner: Address, digest: Hex, signature: Hex): Promise<boolean> };
  network: ArcNetworkName;
  now?: () => number;
}

type Outcome = { status: number; body: { status: "ok" | "rejected" | "rate-limited" | "unavailable" }; cookie?: { value: string; maxAge: number; header: string } };

const body = z.object({
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nonce: z.string().regex(/^[0-9]{1,39}$/),
  deadline: z.number().int(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130,4096}$/),
});

const clientIp = (request: Request): string => (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();

export async function handleOwnerSession(request: Request, deps: OwnerSessionDeps): Promise<Outcome> {
  const reject = (status: number, kind: "rejected" | "rate-limited" | "unavailable" = "rejected"): Outcome => ({ status, body: { status: kind } });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return reject(400);
  const pepper = deps.env.RELAY_IP_PEPPER;
  if (!pepper) return reject(503, "unavailable");
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  try {
    const ip = await deps.limiter.count(`owner-session-ip:${createHash("sha256").update(`${pepper}:${clientIp(request)}`).digest("hex")}`, 60, 10);
    if (!ip.allowed) return reject(429, "rate-limited");
  } catch {
    return reject(502, "unavailable");
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return reject(400);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return reject(400);
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return reject(400);
  const { vault, nonce, deadline, signature } = parsed.data;
  if (deadline <= now || deadline > now + MAX_DEADLINE_AHEAD) return reject(401);
  try {
    const owner = await deps.chain.ownerOf(vault as Address);
    const digest = hashTypedData(ownerTypedData({ chainId: networks[deps.network].chain.id, vault: vault as Address, nonce: BigInt(nonce), deadline }));
    if (!(await deps.chain.accepts(owner, digest, signature as Hex))) return reject(401);
    // the nonce is spent only by a signature the chain accepted, so a failed attempt cannot burn an honest one
    if (!(await spendNonce(deps.sql, vault, nonce, new Date(deadline * 1000)))) return reject(401);
  } catch {
    return reject(502, "unavailable");
  }
  const value = mintOwnerCookie(deps.keys, vault as Address, now + OWNER_SESSION_SECONDS);
  return { status: 200, body: { status: "ok" }, cookie: { value, maxAge: OWNER_SESSION_SECONDS, header: `${OWNER_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${OWNER_SESSION_SECONDS}` } };
}
