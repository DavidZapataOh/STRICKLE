import { readFileSync } from "node:fs";
import type { Address } from "viem";
import { type WavePolicy, parseWavePolicy } from "./wave.ts";

export const POLICY_URL = new URL("../config/early-access.json", import.meta.url);
export const TEAM_URL = new URL("../config/team.json", import.meta.url);

/** The text is returned too: an owner approval is bound to its digest. */
export function loadPolicy(url: URL = POLICY_URL): { text: string; policy: WavePolicy } {
  const text = readFileSync(url, "utf8");
  return { text, policy: parseWavePolicy(JSON.parse(text)) };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function loadTeam(url: URL = TEAM_URL): Address[] {
  const raw: unknown = JSON.parse(readFileSync(url, "utf8"));
  const addresses = typeof raw === "object" && raw !== null ? (raw as { addresses?: unknown }).addresses : undefined;
  if (!Array.isArray(addresses)) throw new Error('the team file must look like { "addresses": ["0x..."] }');
  const bad = addresses.filter((entry) => typeof entry !== "string" || !ADDRESS.test(entry));
  if (bad.length > 0) throw new Error(`the team file holds ${bad.length} entries that are not addresses`);
  return [...new Set((addresses as string[]).map((entry) => entry.toLowerCase()))] as Address[];
}
