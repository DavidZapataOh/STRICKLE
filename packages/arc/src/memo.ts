import { type Address, type Hex, decodeEventLog, encodeFunctionData, getAddress, isHex, keccak256, parseAbi, size, toEventSelector } from "viem";

export const MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505" as const;

export const memoAbi = parseAbi([
  "function memo(address target, bytes data, bytes32 memoId, bytes memoData)",
  "event BeforeMemo(uint256 indexed memoIndex)",
  "event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)",
]);
const erc20 = parseAbi(["function transfer(address to, uint256 value) returns (bool)", "event Transfer(address indexed from, address indexed to, uint256 value)"]);
const BEFORE_MEMO_TOPIC = toEventSelector(memoAbi.find((item) => item.type === "event" && item.name === "BeforeMemo") as never).toLowerCase();

export interface ReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
  logIndex: number;
}

export interface MemoPayment {
  payer: Address;
  token: Address;
  vault: Address;
  amount: bigint;
  memoId: Hex;
  transferLogIndex: number;
}

/** The call a payer's wallet sends. Memo must be called directly by an externally owned account: it forwards the call as that account, and a smart account is refused by the contract. */
export function encodeMemoPayment(input: { token: Address; vault: Address; amount: bigint; memoId: Hex }): { to: Address; data: Hex } {
  if (input.amount <= 0n) throw new Error("the amount must be above zero");
  if (!isHex(input.memoId) || size(input.memoId) !== 32) throw new Error("the memo id must be 32 bytes");
  const transfer = encodeFunctionData({ abi: erc20, functionName: "transfer", args: [input.vault, input.amount] });
  return { to: MEMO_ADDRESS, data: encodeFunctionData({ abi: memoAbi, functionName: "memo", args: [input.token, transfer, input.memoId, "0x"] }) };
}

/**
 * A Memo is a claim, not proof: anyone can emit one. It counts only when the same transaction holds a transfer of the token from the memo's sender, inside the memo's frame, whose call data hashes to the Memo's callDataHash. Only the token's own log counts (Arc also emits a system-level duplicate with 18 decimals).
 */
export function readMemoPayments(receipt: { logs: readonly ReceiptLog[] }, token: Address): MemoPayment[] {
  const payments: MemoPayment[] = [];
  const logs = [...receipt.logs].sort((a, b) => a.logIndex - b.logIndex);
  for (const log of logs) {
    if (getAddress(log.address) !== MEMO_ADDRESS) continue;
    let memo;
    try {
      memo = decodeEventLog({ abi: memoAbi, topics: log.topics as [Hex], data: log.data as Hex });
    } catch {
      continue;
    }
    if (memo.eventName !== "Memo") continue;
    const memoArgs = memo.args as { sender: Address; target: Address; callDataHash: Hex; memoId: Hex; memoIndex: bigint };
    if (getAddress(memoArgs.target) !== getAddress(token)) continue;
    const before = logs.filter((entry) => entry.logIndex < log.logIndex && getAddress(entry.address) === MEMO_ADDRESS && entry.topics.length === 2 && entry.topics[0]?.toLowerCase() === BEFORE_MEMO_TOPIC && BigInt(entry.topics[1] as string) === memoArgs.memoIndex).at(-1);
    const from = before?.logIndex ?? -1;
    for (const entry of logs) {
      if (entry.logIndex <= from || entry.logIndex >= log.logIndex || getAddress(entry.address) !== getAddress(token)) continue;
      let transfer;
      try {
        transfer = decodeEventLog({ abi: erc20, topics: entry.topics as [Hex], data: entry.data as Hex });
      } catch {
        continue;
      }
      if (transfer.eventName !== "Transfer") continue;
      const moved = transfer.args as { from: Address; to: Address; value: bigint };
      if (getAddress(moved.from) !== getAddress(memoArgs.sender)) continue;
      const expected = keccak256(encodeFunctionData({ abi: erc20, functionName: "transfer", args: [moved.to, moved.value] }));
      if (expected !== memoArgs.callDataHash) continue;
      payments.push({ payer: getAddress(memoArgs.sender), token: getAddress(token), vault: getAddress(moved.to), amount: moved.value, memoId: memoArgs.memoId, transferLogIndex: entry.logIndex });
      break;
    }
  }
  return payments;
}
