// The relay's answer shape, kept in a file with no server-only import: the browser needs these types too.
export type RelayStatus = "accepted" | "busy" | "rate-limited" | "rejected" | "paused" | "unknown-vault" | "closed" | "unavailable" | "misconfigured";
export interface RelayResult {
  status: RelayStatus;
  retryAfterSeconds?: number;
}
