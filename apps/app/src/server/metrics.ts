import { createHash } from "node:crypto";
import { networks } from "@strickle/arc/networks";
import { type Address, type PublicClient, erc20Abi, parseAbiItem } from "viem";
import { type Limits, exposureReport } from "./limits.ts";

export const NOT_MEASURED = ["taxesCoveredOnTime", "cushionDays", "yield", "earlyPayments", "invariantBreaches"] as const;

type Network = "testnet" | "mainnet";
type Amounts = { total: string; team: string; organic: string };

export type MoveKind = "split" | "salary" | "swap" | "earn";

export interface Metrics {
  network: Network;
  asOfBlock: string;
  vaults: { total: number; team: number; organic: number };
  usdcHeld: Amounts;
  usdcAllocated: Amounts;
  /** What the agent's own transactions moved, in USDC, by kind and in total. Private spends are not counted: their amounts are hidden by design. */
  agentMoved: { total: Amounts; byKind: Record<MoveKind, Amounts> };
  exposure?: { totalHeld: string; overTotal: boolean; overPerUser: number };
  notMeasured: string[];
}

export interface CollectorState {
  asOfBlock: string;
  factory: Address;
  /** Digest of the explicit team list: a different list means the running totals cannot be reused. */
  teamKey: string;
  vaults: { address: Address; owner: Address }[];
  /** Addresses that received USDC or EURC straight from a team address (lower case, public on chain). */
  funded: Address[];
  allocated: { team: string; organic: string };
  /** The agent's other moves so far; a state saved before they were counted has none and is read again from the start. */
  moved?: Record<Exclude<MoveKind, "split">, { team: string; organic: string }>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(run: () => Promise<T>, options: { attempts?: number; wait?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const attempts = options.attempts ?? 4;
  const wait = options.wait ?? sleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await wait(500 * 2 ** (attempt - 1));
    }
  }
}

export const teamKeyOf = (owners: readonly string[]): string => createHash("sha256").update([...owners].map((owner) => owner.toLowerCase()).sort().join(",")).digest("hex");

const split = (total: bigint, team: bigint): Amounts => ({ total: total.toString(), team: team.toString(), organic: (total - team).toString() });

export function summarize(input: {
  network: Network;
  asOfBlock: bigint;
  vaults: { address: Address; owner: Address }[];
  held: Map<Address, bigint>;
  allocated: { team: bigint; organic: bigint };
  moved?: Record<Exclude<MoveKind, "split">, { team: bigint; organic: bigint }>;
  teamOwners: readonly string[];
  limits?: Limits;
}): Metrics {
  const team = new Set(input.teamOwners.map((owner) => owner.toLowerCase()));
  const isTeam = (owner: Address) => team.has(owner.toLowerCase());
  let held = 0n;
  let heldTeam = 0n;
  for (const vault of input.vaults) {
    const amount = input.held.get(vault.address) ?? 0n;
    held += amount;
    if (isTeam(vault.owner)) heldTeam += amount;
  }
  const teamVaults = input.vaults.filter((vault) => isTeam(vault.owner)).length;
  const zero = { team: 0n, organic: 0n };
  const moved = input.moved ?? { salary: zero, swap: zero, earn: zero };
  const byKind: Record<MoveKind, Amounts> = {
    split: split(input.allocated.team + input.allocated.organic, input.allocated.team),
    salary: split(moved.salary.team + moved.salary.organic, moved.salary.team),
    swap: split(moved.swap.team + moved.swap.organic, moved.swap.team),
    earn: split(moved.earn.team + moved.earn.organic, moved.earn.team),
  };
  const sumTeam = BigInt(byKind.split.team) + BigInt(byKind.salary.team) + BigInt(byKind.swap.team) + BigInt(byKind.earn.team);
  const sumOrganic = BigInt(byKind.split.organic) + BigInt(byKind.salary.organic) + BigInt(byKind.swap.organic) + BigInt(byKind.earn.organic);
  const metrics: Metrics = {
    network: input.network,
    asOfBlock: input.asOfBlock.toString(),
    vaults: { total: input.vaults.length, team: teamVaults, organic: input.vaults.length - teamVaults },
    usdcHeld: split(held, heldTeam),
    usdcAllocated: split(input.allocated.team + input.allocated.organic, input.allocated.team),
    agentMoved: { total: split(sumTeam + sumOrganic, sumTeam), byKind },
    notMeasured: [...NOT_MEASURED],
  };
  if (input.limits) {
    const report = exposureReport(input.vaults.map((vault) => ({ ...vault, held: input.held.get(vault.address) ?? 0n })), input.limits);
    metrics.exposure = { totalHeld: report.totalHeld.toString(), overTotal: report.overTotal, overPerUser: report.overPerUser.length };
  }
  return metrics;
}

const vaultCreated = parseAbiItem("event VaultCreated(address indexed owner, address indexed vault)");
const allocatedEvent = parseAbiItem("event Allocated(uint8 indexed asset, uint8 indexed box, uint256 amount, uint256 newBalance)");
const salaryPaidEvent = parseAbiItem("event SalaryPaid(address indexed vault, uint8 indexed asset, address indexed payee, uint256 amount)");
const swappedEvent = parseAbiItem("event Swapped(uint8 indexed box, uint8 indexed assetIn, uint256 amountIn, uint256 received)");
const earnedEvent = parseAbiItem("event Earned(uint8 indexed asset, uint8 indexed box, address indexed vault, bool deposit, uint256 amountIn, uint256 received)");
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const USDC_ASSET_ID = 1;
const ADDRESSES_PER_QUERY = 100;

/**
 * The team is the addresses the owner lists plus every address that received USDC or EURC directly from one of them. It is one hop:
 * whoever a funded person pays is not the team. Native-token transfers carry no event, so a top-up sent that way is invisible here
 * and its recipient belongs in the team list by hand.
 */
export async function collect(args: {
  client: PublicClient;
  network: Network;
  factory: Address;
  fromBlock: bigint;
  teamAddresses: readonly string[];
  limits?: Limits;
  /** The executor whose `SalaryPaid` events are the salary the agent paid; without it salaries are not counted. */
  executor?: Address;
  previous?: CollectorState;
  toBlock?: bigint;
  step?: bigint;
  wait?: (ms: number) => Promise<void>;
}): Promise<{ metrics: Metrics; state: CollectorState }> {
  const step = args.step ?? 5_000n;
  const retry = <T,>(run: () => Promise<T>) => withRetry(run, { wait: args.wait });
  const asOfBlock = args.toBlock ?? (await retry(() => args.client.getBlockNumber()));
  const teamKey = teamKeyOf(args.teamAddresses);
  const explicit = args.teamAddresses.map((address) => address.toLowerCase() as Address);

  // The running totals were split with the team list of their time: a different list or factory means they cannot be reused.
  const usable = args.previous && args.previous.moved !== undefined && args.previous.teamKey === teamKey && args.previous.factory.toLowerCase() === args.factory.toLowerCase() && BigInt(args.previous.asOfBlock) <= asOfBlock ? args.previous : undefined;
  const scanFrom = usable ? BigInt(usable.asOfBlock) + 1n : args.fromBlock;
  const ranges: [bigint, bigint][] = [];
  for (let from = scanFrom; from <= asOfBlock; from += step) ranges.push([from, from + step - 1n < asOfBlock ? from + step - 1n : asOfBlock]);

  const funded = new Set<string>((usable?.funded ?? []).map((address) => address.toLowerCase()));
  const newlyFunded = new Set<string>();
  const tokens = [networks[args.network].usdc, networks[args.network].eurc] as Address[];
  for (let i = 0; i < explicit.length; i += ADDRESSES_PER_QUERY) {
    const senders = explicit.slice(i, i + ADDRESSES_PER_QUERY);
    for (const [from, to] of ranges) {
      const logs = await retry(() => args.client.getLogs({ address: tokens, event: transferEvent, args: { from: senders }, fromBlock: from, toBlock: to }));
      for (const log of logs) {
        const recipient = (log.args.to as string).toLowerCase();
        if (!funded.has(recipient)) newlyFunded.add(recipient);
        funded.add(recipient);
      }
    }
  }

  // Someone who already had vaults was funded after their earlier splits were counted as organic: those totals cannot be corrected in place.
  if (usable && usable.vaults.some((vault) => newlyFunded.has(vault.owner.toLowerCase()))) return collect({ ...args, previous: undefined });

  const team = new Set([...explicit, ...funded]);
  const vaults = [...(usable?.vaults ?? [])];
  for (const [from, to] of ranges) {
    const logs = await retry(() => args.client.getLogs({ address: args.factory, event: vaultCreated, fromBlock: from, toBlock: to }));
    for (const log of logs) vaults.push({ address: log.args.vault as Address, owner: log.args.owner as Address });
  }

  const moved = { salary: { team: BigInt(usable?.moved?.salary.team ?? 0), organic: BigInt(usable?.moved?.salary.organic ?? 0) }, swap: { team: BigInt(usable?.moved?.swap.team ?? 0), organic: BigInt(usable?.moved?.swap.organic ?? 0) }, earn: { team: BigInt(usable?.moved?.earn.team ?? 0), organic: BigInt(usable?.moved?.earn.organic ?? 0) } };
  let allocatedTeam = BigInt(usable?.allocated.team ?? 0);
  let allocatedOrganic = BigInt(usable?.allocated.organic ?? 0);
  const ownerOf = new Map(vaults.map((vault) => [vault.address.toLowerCase(), vault.owner]));
  for (let i = 0; i < vaults.length; i += ADDRESSES_PER_QUERY) {
    const addresses = vaults.slice(i, i + ADDRESSES_PER_QUERY).map((vault) => vault.address);
    for (const [from, to] of ranges) {
      const logs = await retry(() => args.client.getLogs({ address: addresses, event: allocatedEvent, args: { asset: USDC_ASSET_ID }, fromBlock: from, toBlock: to }));
      for (const log of logs) {
        const amount = log.args.amount as bigint;
        if (team.has((ownerOf.get(log.address.toLowerCase()) ?? "").toLowerCase())) allocatedTeam += amount;
        else allocatedOrganic += amount;
      }
      const add = (kind: "salary" | "swap" | "earn", owner: string | undefined, amount: bigint) => {
        if (team.has((owner ?? "").toLowerCase())) moved[kind].team += amount;
        else moved[kind].organic += amount;
      };
      const swaps = await retry(() => args.client.getLogs({ address: addresses, event: swappedEvent, fromBlock: from, toBlock: to }));
      // a swap counts the dollars of its USDC side: what went in when it started from USDC, what came out when it ended in USDC
      for (const log of swaps) add("swap", ownerOf.get(log.address.toLowerCase()), Number(log.args.assetIn) === USDC_ASSET_ID ? (log.args.amountIn as bigint) : (log.args.received as bigint));
      const earns = await retry(() => args.client.getLogs({ address: addresses, event: earnedEvent, args: { asset: USDC_ASSET_ID }, fromBlock: from, toBlock: to }));
      // a yield move counts the assets: what went in for a deposit, what came out for a withdrawal
      for (const log of earns) add("earn", ownerOf.get(log.address.toLowerCase()), log.args.deposit ? (log.args.amountIn as bigint) : (log.args.received as bigint));
      if (args.executor) {
        const salaries = await retry(() => args.client.getLogs({ address: args.executor as Address, event: salaryPaidEvent, args: { vault: addresses, asset: USDC_ASSET_ID }, fromBlock: from, toBlock: to }));
        for (const log of salaries) add("salary", ownerOf.get((log.args.vault as string).toLowerCase()), log.args.amount as bigint);
      }
    }
  }

  const held = new Map<Address, bigint>();
  const usdc = networks[args.network].usdc;
  for (let i = 0; i < vaults.length; i += 20) {
    const batch = vaults.slice(i, i + 20);
    const balances = await retry(() => Promise.all(batch.map((vault) => args.client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [vault.address], blockNumber: asOfBlock }))));
    batch.forEach((vault, index) => held.set(vault.address, balances[index] as bigint));
  }

  const metrics = summarize({ network: args.network, asOfBlock, vaults, held, allocated: { team: allocatedTeam, organic: allocatedOrganic }, moved, teamOwners: [...team], limits: args.limits });
  return { metrics, state: { asOfBlock: asOfBlock.toString(), factory: args.factory, teamKey, vaults, funded: [...funded].sort() as Address[], allocated: { team: allocatedTeam.toString(), organic: allocatedOrganic.toString() }, moved: { salary: { team: moved.salary.team.toString(), organic: moved.salary.organic.toString() }, swap: { team: moved.swap.team.toString(), organic: moved.swap.organic.toString() }, earn: { team: moved.earn.team.toString(), organic: moved.earn.organic.toString() } } } };
}
