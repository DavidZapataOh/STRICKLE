import type { Address } from "viem";

/**
 * A plain token transfer to a vault cannot be refused by the contracts, so these ceilings guide what the
 * app asks of people and what the monitor flags; they are not an on-chain guarantee.
 */
export interface Limits {
  perUserUnits: bigint;
  totalUnits: bigint;
}

const positive = (value: bigint): bigint => (value > 0n ? value : 0n);

export function depositRoom(args: { held: bigint; totalHeld: bigint; limits: Limits; incoming?: bigint }) {
  const incoming = args.incoming ?? 0n;
  if (incoming < 0n) throw new Error("a deposit cannot be negative");
  const perUserRoom = positive(args.limits.perUserUnits - args.held);
  const totalRoom = positive(args.limits.totalUnits - args.totalHeld);
  return { allowed: incoming <= perUserRoom && incoming <= totalRoom, perUserRoom, totalRoom };
}

export function exposureReport(vaults: { address: Address; owner: Address; held: bigint }[], limits: Limits) {
  const totalHeld = vaults.reduce((sum, vault) => sum + vault.held, 0n);
  return {
    totalHeld,
    overTotal: totalHeld > limits.totalUnits,
    overPerUser: vaults.filter((vault) => vault.held > limits.perUserUnits).map((vault) => ({ ...vault, excess: vault.held - limits.perUserUnits })),
  };
}
