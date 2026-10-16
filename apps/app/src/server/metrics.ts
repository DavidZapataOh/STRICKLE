import { createHash } from "node:crypto";
import { networks } from "@strickle/arc/networks";
import { type Address, type PublicClient, erc20Abi, parseAbiItem } from "viem";
import { type Limits, exposureReport } from "./limits.ts";

export const NOT_MEASURED = ["taxesCoveredOnTime", "cushionDays", "yield", "earlyPayments", "invariantBreaches"] as const;

type Network = "testnet" | "mainnet";
type Amounts = { total: string; team: string; organic: string };

export interface Metrics {
  network: Network;
  asOfBlock: string;
  vaults: { total: number; team: number; organic: number };
  usdcHeld: Amounts;
  usdcAllocated: Amounts;
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
  const metrics: Metrics = {
    network: input.network,
    asOfBlock: input.asOfBlock.toString(),
    vaults: { total: input.vaults.length, team: teamVaults, organic: input.vaults.length - teamVaults },
    usdcHeld: split(held, heldTeam),
    usdcAllocated: split(input.allocated.team + input.allocated.organic, input.allocated.team),
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
  const usable = args.previous && args.previous.teamKey === teamKey && args.previous.factory.toLowerCase() === args.factory.toLowerCase() && BigInt(args.previous.asOfBlock) <= asOfBlock ? args.previous : undefined;
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
    }
  }

  const held = new Map<Address, bigint>();
  const usdc = networks[args.network].usdc;
  for (let i = 0; i < vaults.length; i += 20) {
    const batch = vaults.slice(i, i + 20);
    const balances = await retry(() => Promise.all(batch.map((vault) => args.client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [vault.address], blockNumber: asOfBlock }))));
    batch.forEach((vault, index) => held.set(vault.address, balances[index] as bigint));
  }

  const metrics = summarize({ network: args.network, asOfBlock, vaults, held, allocated: { team: allocatedTeam, organic: allocatedOrganic }, teamOwners: [...team], limits: args.limits });
  return { metrics, state: { asOfBlock: asOfBlock.toString(), factory: args.factory, teamKey, vaults, funded: [...funded].sort() as Address[], allocated: { team: allocatedTeam.toString(), organic: allocatedOrganic.toString() } } };
}
