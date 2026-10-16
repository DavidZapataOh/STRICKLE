import { type Address, type Hex, decodeEventLog, getAddress, parseAbi } from "viem";

const transfer = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** What a token credited to an account in a transaction (the vault on arrival; the user's wallet after a swap). Only the token's own logs count: Arc also emits system-level duplicates, and the sender is Circle's executor in receive-exact mode, so nothing here looks at who sent it. */
export function creditedLog(receipt: { logs: readonly { address: string; topics: readonly string[]; data: string; logIndex: number }[] }, token: Address, account: Address): { amount: bigint; logIndex: number; from: Address }[] {
  const credits: { amount: bigint; logIndex: number; from: Address }[] = [];
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(token)) continue;
    try {
      const args = decodeEventLog({ abi: transfer, topics: log.topics as [Hex], data: log.data as Hex }).args as { from: Address; to: Address; value: bigint };
      if (getAddress(args.to) === getAddress(account)) credits.push({ amount: args.value, logIndex: log.logIndex, from: getAddress(args.from) });
    } catch {
      // another event of the token
    }
  }
  return credits;
}

export const creditedTo = (receipt: Parameters<typeof creditedLog>[0], token: Address, account: Address): bigint => creditedLog(receipt, token, account).reduce((sum, credit) => sum + credit.amount, 0n);
