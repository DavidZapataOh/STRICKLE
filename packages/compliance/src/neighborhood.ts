import { type Address, getAddress } from "viem";

export interface Transfer {
  from: Address;
  to: Address;
  timestamp: number;
}

export interface Exposure {
  risk: 1 | 2;
  hop: number;
  via: Address;
}

export interface ExpandArgs {
  blocked: Set<Address>;
  transfers: Transfer[];
  hops: 1 | 2;
  windowSeconds: number;
  now: number;
  /** Infrastructure that every user touches (the pool, the token, exchanges): never flagged and never a bridge. */
  exempt: Set<Address>;
}

/**
 * Sanctions exposure bounded in hops and in time: blocked addresses are risk 2 at hop 0; addresses that
 * exchanged value with them inside the window are risk 1 at hop 1; with `hops: 2` their counterparties are
 * risk 1 at hop 2. The nearest explanation wins.
 */
export function expandRisk(args: ExpandArgs): Map<Address, Exposure> {
  const blocked = new Set([...args.blocked].map((address) => getAddress(address)));
  const exempt = new Set([...args.exempt].map((address) => getAddress(address)));
  const earliest = args.now - args.windowSeconds;
  const neighbours = new Map<Address, Set<Address>>();
  const link = (x: Address, y: Address) => {
    if (!neighbours.has(x)) neighbours.set(x, new Set());
    neighbours.get(x)?.add(y);
  };
  for (const transfer of args.transfers) {
    if (transfer.timestamp < earliest || transfer.timestamp > args.now) continue;
    const from = getAddress(transfer.from);
    const to = getAddress(transfer.to);
    link(from, to);
    link(to, from);
  }

  const result = new Map<Address, Exposure>();
  for (const address of blocked) result.set(address, { risk: 2, hop: 0, via: address });

  let frontier = [...blocked];
  for (let hop = 1; hop <= args.hops; hop++) {
    const next: Address[] = [];
    for (const source of frontier) {
      for (const neighbour of neighbours.get(source) ?? []) {
        if (exempt.has(neighbour) || result.has(neighbour)) continue;
        result.set(neighbour, { risk: 1, hop, via: source });
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return result;
}
