import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";

type Pending = Profile["earn"]["pending"][number];
type Reason = Extract<Notice, { kind: "yield-exit" }>["reason"];

/** Larger than any position a person can hold: the move takes the whole position, whatever it is worth by then. */
const WHOLE = (10n ** 15n).toString();
const MAX_PENDING = 4;
const isExit = (entry: Pending): boolean => !entry.deposit && entry.auto === true;

/**
 * One withdrawal of the whole position for every box that holds shares in a vault that misbehaves, plus one notice each. An exit never waits for the owner and never
 * loses its place: when the four places are taken the oldest request that is not an exit makes room. A deposit waiting for the same box and vault goes, because the vault is no longer safe.
 */
export function exitIntents(input: {
  profile: Profile;
  anomalies: readonly { id: string; reason: Reason }[];
  shares: Record<string, Partial<Record<Pending["box"], bigint>>>;
  vaults: Record<string, { address: string; name: string }>;
  now: number;
}): { next: Profile; notices: Notice[] } {
  let pending = [...input.profile.earn.pending];
  const notices: Notice[] = [];
  for (const anomaly of input.anomalies) {
    const vault = input.vaults[anomaly.id];
    if (!vault) continue;
    for (const [box, shares] of Object.entries(input.shares[anomaly.id] ?? {}) as [Pending["box"], bigint][]) {
      if (shares <= 0n) continue;
      const same = (entry: Pending) => entry.box === box && entry.vault.toLowerCase() === vault.address.toLowerCase();
      if (pending.some((entry) => same(entry) && isExit(entry))) continue;
      pending = pending.filter((entry) => !(same(entry) && entry.deposit));
      while (pending.length >= MAX_PENDING) {
        const oldest = [...pending].filter((entry) => !isExit(entry)).sort((a, b) => a.at - b.at)[0] ?? [...pending].sort((a, b) => a.at - b.at)[0];
        pending = pending.filter((entry) => entry !== oldest);
      }
      pending.push({ id: `x${input.now.toString(36)}${box.slice(0, 2)}`, box, vault: vault.address, amount: WHOLE, deposit: false, at: input.now, auto: true });
      notices.push({ kind: "yield-exit", box, name: vault.name, reason: anomaly.reason });
    }
  }
  return { next: { ...input.profile, earn: { ...input.profile.earn, pending } }, notices };
}
