import { createHash, randomBytes } from "node:crypto";

export interface ParsedConfig {
  port: number;
  circuitsDir: string;
  tokenHashes: string[];
  secret?: bigint;
}

export function parseConfig(env: Record<string, string | undefined>): ParsedConfig {
  const tokens = env.PROVER_TOKENS?.split(",").map((value) => value.trim()).filter(Boolean);
  if (!tokens?.length) throw new Error("PROVER_TOKENS is required: a comma-separated list of SHA-256 hex digests");
  if (!tokens.every((value) => /^[0-9a-f]{64}$/.test(value))) throw new Error("PROVER_TOKENS must contain only SHA-256 hex digests (64 lowercase hex characters)");

  const port = env.PORT === undefined ? 8787 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");

  let secret: bigint | undefined;
  if (env.PROVER_SECRET !== undefined) {
    if (!/^(0x)?[0-9a-fA-F]+$/.test(env.PROVER_SECRET)) throw new Error("PROVER_SECRET must be a hex scalar");
    secret = BigInt(env.PROVER_SECRET.startsWith("0x") ? env.PROVER_SECRET : `0x${env.PROVER_SECRET}`);
  }
  return { port, circuitsDir: env.PROVER_CIRCUITS ?? "circuits/target", tokenHashes: tokens, secret };
}

/** A fresh bearer token for a caller, and the digest the service is configured with. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
