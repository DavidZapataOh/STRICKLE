// The relay's answer shape, kept in a file with no server-only import: the browser needs these types too.
export type RelayStatus = "accepted" | "busy" | "rate-limited" | "rejected" | "paused" | "unknown-vault" | "closed" | "unavailable" | "misconfigured";
export interface RelayResult {
  status: RelayStatus;
  retryAfterSeconds?: number;
}

const STATUSES: readonly string[] = ["accepted", "busy", "rate-limited", "rejected", "paused", "unknown-vault", "closed", "unavailable", "misconfigured"];

/** The relay answers with a status; the gate in front of it answers with an error. Both become one result the client can act on, and anything else is "unavailable", never success. */
export function relayResultOf(body: unknown): RelayResult {
  const record = typeof body === "object" && body !== null ? (body as { status?: unknown; error?: unknown; retryAfterSeconds?: unknown }) : {};
  if (typeof record.status === "string" && STATUSES.includes(record.status)) {
    return { status: record.status as RelayStatus, ...(typeof record.retryAfterSeconds === "number" ? { retryAfterSeconds: record.retryAfterSeconds } : {}) };
  }
  if (record.error === "access-required" || record.error === "closed") return { status: "closed" };
  return { status: "unavailable" };
}
