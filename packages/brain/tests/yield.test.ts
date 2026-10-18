import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, type Observation, type VaultView, detectAnomalies, planAllocation } from "../src/yield.ts";

const M = 1_000_000n;
const vault = (id: string, apyBps: number, over: Partial<VaultView> = {}): VaultView => ({ id, protocol: "morpho", apyBps, active: true, liquidity: 1_000_000n * M, ...over });
const used = (moves: { amount: bigint }[]) => moves.reduce((sum, move) => sum + move.amount, 0n);

describe("planAllocation", () => {
  it("fills the best vault first and spreads the rest when two are eligible", () => {
    const plan = planAllocation({ budget: 1_000n * M, held: {}, vaults: [vault("a", 400), vault("b", 300)] });
    expect(plan.moves).toEqual([{ vault: "a", amount: 600n * M }, { vault: "b", amount: 400n * M }]);
    expect(plan.left).toBe(0n);
  });

  it("puts everything in one vault when it is the only one, up to the liquidity share", () => {
    expect(planAllocation({ budget: 1_000n * M, held: {}, vaults: [vault("a", 400)] }).moves).toEqual([{ vault: "a", amount: 1_000n * M }]);
    const small = planAllocation({ budget: 1_000n * M, held: {}, vaults: [vault("a", 400, { liquidity: 2_000n * M })] });
    expect(small.moves).toEqual([{ vault: "a", amount: 400n * M }]);
    expect(small.left).toBe(600n * M);
  });

  it("counts what is already held towards every cap", () => {
    const plan = planAllocation({ budget: 100n * M, held: { a: 600n * M, b: 400n * M }, vaults: [vault("a", 400), vault("b", 300)] });
    // the cap is a share of the total after the move: 60% of 1,100 is 660, so the best vault still takes 60 and the other 40
    expect(plan.moves).toEqual([{ vault: "a", amount: 60n * M }, { vault: "b", amount: 40n * M }]);
    expect(plan.left).toBe(0n);
    const over = planAllocation({ budget: 100n * M, held: { a: 900n * M, b: 100n * M }, vaults: [vault("a", 400), vault("b", 300)] });
    expect(over.moves).toEqual([{ vault: "b", amount: 100n * M }]);
    expect(over.left).toBe(0n);
  });

  it("skips a vault that is inactive, pays too little, has no liquidity or has no room", () => {
    const vaults = [vault("a", 400, { active: false }), vault("b", 10), vault("c", 300, { liquidity: 0n }), vault("d", 200)];
    expect(planAllocation({ budget: 100n * M, held: {}, vaults }).moves).toEqual([{ vault: "d", amount: 100n * M }]);
  });

  it("is bounded by the protocol cap before the vault cap when two vaults share a protocol", () => {
    const plan = planAllocation({ budget: 1_000n * M, held: {}, vaults: [vault("a", 400), vault("b", 390), vault("c", 300, { protocol: "other" })] });
    const morpho = plan.moves.filter((move) => move.vault !== "c").reduce((sum, move) => sum + move.amount, 0n);
    expect(morpho * 10_000n <= BigInt(DEFAULT_LIMITS.perProtocolBps) * used(plan.moves)).toBe(true);
    expect(plan.moves.find((move) => move.vault === "c")?.amount ?? 0n).toBeGreaterThan(0n);
  });

  it("makes no move for a zero budget, no vaults or nothing eligible", () => {
    expect(planAllocation({ budget: 0n, held: {}, vaults: [vault("a", 400)] })).toEqual({ moves: [], left: 0n });
    expect(planAllocation({ budget: 5n, held: {}, vaults: [] })).toEqual({ moves: [], left: 5n });
    expect(planAllocation({ budget: 5n, held: {}, vaults: [vault("a", 1)] })).toEqual({ moves: [], left: 5n });
  });

  it("is deterministic when two vaults pay the same", () => {
    const one = planAllocation({ budget: 100n * M, held: {}, vaults: [vault("b", 400), vault("a", 400)] });
    const two = planAllocation({ budget: 100n * M, held: {}, vaults: [vault("a", 400), vault("b", 400)] });
    expect(one).toEqual(two);
  });

  const vaultsArb = fc.array(
    fc.record({ id: fc.constantFrom("a", "b", "c", "d", "e"), protocol: fc.constantFrom("morpho", "aave", "other"), apyBps: fc.integer({ min: 0, max: 3_000 }), active: fc.boolean(), liquidity: fc.bigInt({ min: 0n, max: 10_000_000n * M }) }),
    { maxLength: 5 },
  ).map((list) => [...new Map(list.map((entry) => [entry.id, entry])).values()]);

  it("never breaks a cap, never spends more than the budget and never makes a zero move (property)", () => {
    fc.assert(
      fc.property(vaultsArb, fc.bigInt({ min: 0n, max: 2_000_000n * M }), fc.dictionary(fc.constantFrom("a", "b", "c", "d", "e"), fc.bigInt({ min: 0n, max: 500_000n * M })), (vaults, budget, held) => {
        const plan = planAllocation({ budget, held, vaults });
        expect(used(plan.moves) + plan.left).toBe(budget);
        expect(plan.moves.every((move) => move.amount > 0n)).toBe(true);
        const final = Object.values(held).reduce((sum, value) => sum + value, 0n) + used(plan.moves);
        const eligible = vaults.filter((entry) => entry.active && entry.apyBps >= DEFAULT_LIMITS.minApyBps && entry.liquidity > 0n);
        const protocols = new Set(eligible.map((entry) => entry.protocol));
        const byProtocol = new Map<string, bigint>();
        for (const move of plan.moves) {
          const entry = vaults.find((candidate) => candidate.id === move.vault) as VaultView;
          const total = (held[move.vault] ?? 0n) + move.amount;
          expect(total * 10_000n <= entry.liquidity * BigInt(DEFAULT_LIMITS.liquidityShareBps)).toBe(true);
          if (eligible.length >= 2) expect(total * 10_000n <= BigInt(DEFAULT_LIMITS.perVaultBps) * final).toBe(true);
          byProtocol.set(entry.protocol, (byProtocol.get(entry.protocol) ?? 0n) + move.amount);
        }
        if (protocols.size >= 2) {
          for (const protocol of byProtocol.keys()) {
            const holding = vaults.filter((entry) => entry.protocol === protocol).reduce((sum, entry) => sum + (held[entry.id] ?? 0n), 0n) + (byProtocol.get(protocol) ?? 0n);
            expect(holding * 10_000n <= BigInt(DEFAULT_LIMITS.perProtocolBps) * final).toBe(true);
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});

const obs = (id: string, over: Partial<Observation> = {}): Observation => ({ id, price: 1_000_000n * M, apyBps: 420, active: true, liquidity: 1_000_000n * M, ...over });

describe("detectAnomalies", () => {
  const held = { a: 100n * M };
  const run = (now: Observation[], before: Observation[] = [obs("a")]) => detectAnomalies({ before, now, held });

  it("stays quiet for a vault that earns, whose rate moves a little and that is open", () => {
    expect(run([obs("a", { price: 1_010_000n * M, apyBps: 500 })])).toEqual([]);
  });

  it("flags a price drop of more than 1%, not of exactly 1%", () => {
    expect(run([obs("a", { price: 990_000n * M })])).toEqual([]);
    expect(run([obs("a", { price: 989_999n * M })])).toEqual([{ id: "a", reason: "price-drop" }]);
  });

  it("flags a rate that triples above 25%, not one that triples below it", () => {
    expect(run([obs("a", { apyBps: 2_600 })], [obs("a", { apyBps: 800 })])).toEqual([{ id: "a", reason: "rate-spike" }]);
    expect(run([obs("a", { apyBps: 2_400 })], [obs("a", { apyBps: 800 })])).toEqual([]);
    expect(run([obs("a", { apyBps: 900 })], [obs("a", { apyBps: 100 })])).toEqual([]);
  });

  it("flags an inactive vault and a position larger than the liquidity", () => {
    expect(run([obs("a", { active: false })])).toEqual([{ id: "a", reason: "inactive" }]);
    expect(run([obs("a", { liquidity: 99n * M })])).toEqual([{ id: "a", reason: "illiquid" }]);
    expect(detectAnomalies({ before: [obs("a")], now: [obs("a", { liquidity: 0n })], held: {} })).toEqual([]);
  });

  it("never flags a vault it has not seen before, and says one reason per vault", () => {
    expect(run([obs("a", { price: 1n, active: false })], [])).toEqual([]);
    expect(run([obs("a", { price: 1n, active: false })])).toHaveLength(1);
  });

  it("flags only the vault that misbehaves", () => {
    expect(detectAnomalies({ before: [obs("a"), obs("b")], now: [obs("a"), obs("b", { price: 1n })], held: { a: 1n, b: 1n } })).toEqual([{ id: "b", reason: "price-drop" }]);
  });
});
