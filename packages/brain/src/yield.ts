/** What the brain knows about one yield vault when it decides: the rate Circle lists, whether it is open and how much can leave it now. */
export interface VaultView {
  id: string;
  protocol: string;
  apyBps: number;
  active: boolean;
  liquidity: bigint;
}

export interface RiskLimits {
  /** A vault's share of the money in vaults; enforced only when two or more vaults are eligible. */
  perVaultBps: number;
  /** A protocol's share of the money in vaults; enforced only when two or more protocols are eligible. */
  perProtocolBps: number;
  /** A position never exceeds this share of the vault's available liquidity, so a full exit is always possible. */
  liquidityShareBps: number;
  minApyBps: number;
}

export const DEFAULT_LIMITS: RiskLimits = { perVaultBps: 6_000, perProtocolBps: 8_000, liquidityShareBps: 2_000, minApyBps: 50 };

const BPS = 10_000n;
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const atLeastZero = (value: bigint): bigint => (value > 0n ? value : 0n);

/**
 * Spreads a budget over the eligible vaults, best rate first, inside the limits. The caps are shares of the final total, which depends on how much is
 * placed, so the total is lowered until it is the one the caps hold at. Money that cannot be placed stays in `left`. Integer arithmetic, rounding down.
 */
export function planAllocation(input: { budget: bigint; held: Record<string, bigint>; vaults: readonly VaultView[]; limits?: RiskLimits }): { moves: { vault: string; amount: bigint }[]; left: bigint } {
  const { budget, held, vaults } = input;
  const limits = input.limits ?? DEFAULT_LIMITS;
  const none = { moves: [], left: budget > 0n ? budget : 0n };
  if (budget <= 0n) return none;
  const eligible = vaults.filter((vault) => vault.active && vault.apyBps >= limits.minApyBps && vault.liquidity > 0n).sort((a, b) => b.apyBps - a.apyBps || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (eligible.length === 0) return none;

  const heldOf = (id: string): bigint => held[id] ?? 0n;
  const base = Object.values(held).reduce((sum, value) => sum + value, 0n);
  // with one vault or one protocol concentration cannot be avoided, so the box's own investable share bounds the exposure instead
  const capVaults = eligible.length >= 2 && limits.perVaultBps < 10_000;
  const capProtocols = new Set(eligible.map((vault) => vault.protocol)).size >= 2 && limits.perProtocolBps < 10_000;
  const heldByProtocol = (protocol: string): bigint => vaults.filter((vault) => vault.protocol === protocol).reduce((sum, vault) => sum + heldOf(vault.id), 0n);

  let total = base + budget;
  for (let round = 0; round < 256; round += 1) {
    const moves: { vault: string; amount: bigint }[] = [];
    const placed = new Map<string, bigint>();
    let spent = 0n;
    for (const vault of eligible) {
      let room = (vault.liquidity * BigInt(limits.liquidityShareBps)) / BPS - heldOf(vault.id);
      if (capVaults) room = min(room, (total * BigInt(limits.perVaultBps)) / BPS - heldOf(vault.id));
      if (capProtocols) room = min(room, (total * BigInt(limits.perProtocolBps)) / BPS - heldByProtocol(vault.protocol) - (placed.get(vault.protocol) ?? 0n));
      const amount = min(atLeastZero(room), budget - spent);
      if (amount <= 0n) continue;
      moves.push({ vault: vault.id, amount });
      placed.set(vault.protocol, (placed.get(vault.protocol) ?? 0n) + amount);
      spent += amount;
    }
    const final = base + spent;
    const holds =
      (!capVaults || moves.every((move) => (heldOf(move.vault) + move.amount) * BPS <= BigInt(limits.perVaultBps) * final)) &&
      (!capProtocols || [...placed.keys()].every((protocol) => (heldByProtocol(protocol) + (placed.get(protocol) ?? 0n)) * BPS <= BigInt(limits.perProtocolBps) * final));
    if (holds) return { moves, left: budget - spent };
    total = final;
  }
  return none;
}

/** One reading of a vault: its share price (assets per 1e18 shares), its rate, whether it is open and its available liquidity. */
export interface Observation {
  id: string;
  price: bigint;
  apyBps: number;
  active: boolean;
  liquidity: bigint;
}

export type AnomalyReason = "price-drop" | "rate-spike" | "inactive" | "illiquid";

const MAX_DROP_BPS = 100n;
const SPIKE_FACTOR = 3;
const SPIKE_FLOOR_BPS = 2_500;

/** Vaults that behave abnormally since the last reading, one reason each; a vault not seen before is only recorded, never flagged. A yield vault's share price only goes up, so any real drop is a loss. */
export function detectAnomalies(input: { before: readonly Observation[]; now: readonly Observation[]; held: Record<string, bigint> }): { id: string; reason: AnomalyReason }[] {
  const found: { id: string; reason: AnomalyReason }[] = [];
  for (const current of input.now) {
    const previous = input.before.find((entry) => entry.id === current.id);
    if (!previous) continue;
    let reason: AnomalyReason | undefined;
    if (!current.active) reason = "inactive";
    else if (previous.price > 0n && current.price * BPS < previous.price * (BPS - MAX_DROP_BPS)) reason = "price-drop";
    else if (current.apyBps > SPIKE_FACTOR * previous.apyBps && current.apyBps > SPIKE_FLOOR_BPS) reason = "rate-spike";
    else if ((input.held[current.id] ?? 0n) > 0n && current.liquidity < (input.held[current.id] ?? 0n)) reason = "illiquid";
    if (reason) found.push({ id: current.id, reason });
  }
  return found;
}
