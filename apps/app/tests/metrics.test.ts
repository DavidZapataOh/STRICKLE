import { describe, expect, it } from "vitest";
import { NOT_MEASURED, collect, summarize, teamKeyOf, withRetry } from "../src/server/metrics.ts";

const v = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const owners = [v(0xa1), v(0xa2), v(0xa3)];
const vaults = owners.map((owner, i) => ({ address: v(0xb0 + i), owner }));

describe("summarize", () => {
  const input = {
    network: "mainnet" as const,
    asOfBlock: 100n,
    vaults,
    held: new Map([[v(0xb0), 100_000_000n], [v(0xb1), 40_000_000n], [v(0xb2), 0n]]),
    allocated: { team: 300_000_000n, organic: 70_000_000n },
    teamOwners: [v(0xa1).toUpperCase().replace("0X", "0x")],
  };

  it("separates the team from everyone else, whatever the address casing", () => {
    const metrics = summarize(input);
    expect(metrics.vaults).toEqual({ total: 3, team: 1, organic: 2 });
    expect(metrics.usdcHeld).toEqual({ total: "140000000", team: "100000000", organic: "40000000" });
    expect(metrics.usdcAllocated).toEqual({ total: "370000000", team: "300000000", organic: "70000000" });
  });

  it("always adds up: team plus organic is the total", () => {
    const m = summarize(input);
    expect(BigInt(m.usdcHeld.team) + BigInt(m.usdcHeld.organic)).toBe(BigInt(m.usdcHeld.total));
    expect(m.vaults.team + m.vaults.organic).toBe(m.vaults.total);
  });

  it("names what it cannot measure instead of reporting zero", () => {
    const metrics = summarize(input);
    expect(metrics.notMeasured).toEqual([...NOT_MEASURED]);
    expect(JSON.stringify(metrics)).not.toMatch(/cushionDays":0|yield":0/);
  });

  it("reports an empty network as zeros that are true", () => {
    const metrics = summarize({ ...input, vaults: [], held: new Map(), allocated: { team: 0n, organic: 0n } });
    expect(metrics.vaults.total).toBe(0);
    expect(metrics.usdcHeld.total).toBe("0");
  });

  it("includes the exposure check only when limits are configured", () => {
    expect(summarize(input).exposure).toBeUndefined();
    const withLimits = summarize({ ...input, limits: { perUserUnits: 50_000_000n, totalUnits: 120_000_000n } });
    expect(withLimits.exposure).toEqual({ totalHeld: "140000000", overTotal: true, overPerUser: 1 });
  });
});

describe("withRetry", () => {
  it("retries with growing waits and returns the first success", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(async () => { if (++calls < 3) throw new Error("rate limit exceeded"); return "ok"; }, { wait: async (ms) => void waits.push(ms) });
    expect(result).toBe("ok");
    expect(waits).toEqual([500, 1000]);
  });

  it("gives up after four attempts with the last error", async () => {
    const waits: number[] = [];
    await expect(withRetry(async () => { throw new Error("rate limit exceeded"); }, { wait: async (ms) => void waits.push(ms) })).rejects.toThrow("rate limit exceeded");
    expect(waits).toEqual([500, 1000, 2000]);
  });
});

// A scripted chain: the real one is used by the integration test, this stand-in lets the unit test place events exactly where it needs them.
function scriptedClient(chain: { created: { block: bigint; owner: `0x${string}`; vault: `0x${string}` }[]; allocated: { block: bigint; vault: `0x${string}`; amount: bigint }[]; transfers: { block: bigint; from: `0x${string}`; to: `0x${string}` }[]; balances: Record<string, bigint>; head: bigint }) {
  const ranges: [bigint, bigint][] = [];
  const client = {
    getBlockNumber: async () => chain.head,
    getLogs: async (args: { event: { name: string }; fromBlock: bigint; toBlock: bigint; address: `0x${string}` | `0x${string}`[]; args?: { from?: `0x${string}`[] } }) => {
      ranges.push([args.fromBlock, args.toBlock]);
      const inside = (block: bigint) => block >= args.fromBlock && block <= args.toBlock;
      if (args.event.name === "Transfer") {
        const senders = new Set((args.args?.from ?? []).map((address) => address.toLowerCase()));
        return chain.transfers.filter((log) => inside(log.block) && senders.has(log.from.toLowerCase())).map((log) => ({ address: "0xtoken", args: { from: log.from, to: log.to } }));
      }
      if (args.event.name === "VaultCreated") return chain.created.filter((log) => inside(log.block)).map((log) => ({ address: "0xfactory", args: { owner: log.owner, vault: log.vault } }));
      const wanted = new Set((Array.isArray(args.address) ? args.address : [args.address]).map((a) => a.toLowerCase()));
      return chain.allocated.filter((log) => inside(log.block) && wanted.has(log.vault.toLowerCase())).map((log) => ({ address: log.vault, args: { amount: log.amount } }));
    },
    readContract: async (call: { args: [`0x${string}`] }) => chain.balances[call.args[0].toLowerCase()] ?? 0n,
  };
  return { client: client as never, ranges };
}

describe("collect", () => {
  const factory = v(0xfa);
  const world = {
    created: [{ block: 10n, owner: v(0xa1), vault: v(0xb0) }, { block: 30n, owner: v(0xa2), vault: v(0xb1) }],
    allocated: [{ block: 11n, vault: v(0xb0), amount: 100n }, { block: 31n, vault: v(0xb1), amount: 40n }, { block: 40n, vault: v(0xb0), amount: 7n }],
    transfers: [],
    balances: { [v(0xb0)]: 60n, [v(0xb1)]: 40n },
    head: 50n,
  };
  const base = { network: "testnet" as const, factory, fromBlock: 1n, teamAddresses: [v(0xa1)], step: 20n, wait: async () => undefined };

  it("reads the whole history the first time", async () => {
    const { client } = scriptedClient(world);
    const { metrics, state } = await collect({ ...base, client });
    expect(metrics.vaults).toEqual({ total: 2, team: 1, organic: 1 });
    expect(metrics.usdcAllocated).toEqual({ total: "147", team: "107", organic: "40" });
    expect(metrics.usdcHeld).toEqual({ total: "100", team: "60", organic: "40" });
    expect(state.asOfBlock).toBe("50");
    expect(state.allocated).toEqual({ team: "107", organic: "40" });
  });

  it("resumes after the previous block and gets exactly the same answer as a full read", async () => {
    const first = await collect({ ...base, client: scriptedClient({ ...world, head: 35n }).client, toBlock: 35n });
    const resumed = scriptedClient(world);
    const incremental = await collect({ ...base, client: resumed.client, previous: first.state });
    const full = await collect({ ...base, client: scriptedClient(world).client });
    expect(incremental.metrics).toEqual(full.metrics);
    expect(incremental.state).toEqual(full.state);
    expect(Math.min(...resumed.ranges.map(([from]) => Number(from)))).toBe(36);
  });

  it("reads the balances again every run, because they are the thing being measured", async () => {
    const first = await collect({ ...base, client: scriptedClient(world).client });
    const later = await collect({ ...base, client: scriptedClient({ ...world, balances: { [v(0xb0)]: 1n, [v(0xb1)]: 2n } }).client, previous: first.state });
    expect(later.metrics.usdcHeld.total).toBe("3");
  });

  it("starts over when the team list or the factory changed, because the running totals could not be split any more", async () => {
    const first = await collect({ ...base, client: scriptedClient(world).client });
    const changed = scriptedClient(world);
    const rebuilt = await collect({ ...base, client: changed.client, previous: first.state, teamAddresses: [v(0xa2)] });
    expect(rebuilt.metrics.vaults).toEqual({ total: 2, team: 1, organic: 1 });
    expect(rebuilt.metrics.usdcAllocated.team).toBe("40");
    expect(Math.min(...changed.ranges.map(([from]) => Number(from)))).toBe(1);
    expect(teamKeyOf([v(0xa1), v(0xa2)])).toBe(teamKeyOf([v(0xa2).toUpperCase().replace("0X", "0x") as `0x${string}`, v(0xa1)]));
  });
});

describe("collect: who the team funded counts as the team", () => {
  const factory = v(0xfa);
  const outsider = v(0x99);
  const world = {
    created: [{ block: 10n, owner: v(0xa1), vault: v(0xb0) }, { block: 30n, owner: v(0xa2), vault: v(0xb1) }, { block: 35n, owner: v(0xa3), vault: v(0xb2) }],
    allocated: [{ block: 11n, vault: v(0xb0), amount: 100n }, { block: 31n, vault: v(0xb1), amount: 40n }, { block: 36n, vault: v(0xb2), amount: 7n }],
    transfers: [
      { block: 5n, from: v(0xa1), to: v(0xa2) },
      { block: 6n, from: outsider, to: v(0xa3) },
      { block: 20n, from: v(0xa2), to: v(0xa3) },
    ],
    balances: { [v(0xb0)]: 60n, [v(0xb1)]: 40n, [v(0xb2)]: 7n },
    head: 50n,
  };
  const base = { network: "testnet" as const, factory, fromBlock: 1n, teamAddresses: [v(0xa1)], step: 20n, wait: async () => undefined };

  it("counts an owner who received funds from a team address, and only that one", async () => {
    const { metrics, state } = await collect({ ...base, client: scriptedClient(world).client });
    expect(metrics.vaults).toEqual({ total: 3, team: 2, organic: 1 });
    expect(metrics.usdcAllocated).toEqual({ total: "147", team: "140", organic: "7" });
    expect(state.funded).toEqual([v(0xa2)]);
  });

  it("is not transitive: whoever a funded user pays does not become the team", async () => {
    const { metrics } = await collect({ ...base, client: scriptedClient(world).client });
    expect(metrics.usdcHeld).toEqual({ total: "107", team: "100", organic: "7" });
  });

  it("counts a person funded before they ever opened a vault", async () => {
    const early = { ...world, transfers: [{ block: 2n, from: v(0xa1), to: v(0xa3) }] };
    const { metrics } = await collect({ ...base, client: scriptedClient(early).client });
    expect(metrics.vaults).toEqual({ total: 3, team: 2, organic: 1 });
    expect(metrics.usdcAllocated.team).toBe("107");
  });

  it("starts over when funding arrives for an owner whose earlier splits were already counted as organic", async () => {
    const late = { ...world, transfers: [{ block: 40n, from: v(0xa1), to: v(0xa2) }] };
    const first = await collect({ ...base, client: scriptedClient({ ...late, head: 35n }).client, toBlock: 35n });
    expect(first.metrics.usdcAllocated).toEqual({ total: "140", team: "100", organic: "40" });
    const resumed = scriptedClient(late);
    const incremental = await collect({ ...base, client: resumed.client, previous: first.state });
    const full = await collect({ ...base, client: scriptedClient(late).client });
    expect(incremental.metrics).toEqual(full.metrics);
    expect(incremental.state).toEqual(full.state);
    expect(incremental.metrics.usdcAllocated.team).toBe("140");
    expect(Math.min(...resumed.ranges.map(([from]) => Number(from)))).toBe(1);
  });

  it("resumes without starting over when the new funding concerns nobody who had a vault yet", async () => {
    const later = { ...world, transfers: [{ block: 45n, from: v(0xa1), to: v(0x77) }] };
    const first = await collect({ ...base, client: scriptedClient({ ...later, head: 40n }).client, toBlock: 40n });
    const resumed = scriptedClient(later);
    const incremental = await collect({ ...base, client: resumed.client, previous: first.state });
    const full = await collect({ ...base, client: scriptedClient(later).client });
    expect(incremental.metrics).toEqual(full.metrics);
    expect(Math.min(...resumed.ranges.map(([from]) => Number(from)))).toBe(41);
  });

  it("asks for nothing when there is no team to fund anyone", async () => {
    const { client, ranges } = scriptedClient(world);
    const { metrics } = await collect({ ...base, client, teamAddresses: [] });
    expect(metrics.vaults.team).toBe(0);
    expect(ranges.length).toBeGreaterThan(0);
  });
});
