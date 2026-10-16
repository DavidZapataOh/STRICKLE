export type AccessGate = (request: Request) => Promise<"allow" | "deny" | "closed">;

// Replaced by the early-access gate (invite cookie, closed mode) when that work lands; until then anyone with the app may reach the relay,
// and the on-chain and rate checks below are what protect it.
export const openGate: AccessGate = async () => "allow";
