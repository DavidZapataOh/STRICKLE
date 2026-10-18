/** What the vault will still let the agent put to work in a box: the box's allowed share of its cash and what already works, less what already works; never more than the cash. */
export function investRoom(input: { cash: bigint; working: bigint; maxBps: number }): bigint {
  const allowed = (BigInt(input.maxBps) * (input.cash + input.working)) / 10_000n;
  const room = allowed > input.working ? allowed - input.working : 0n;
  return room < input.cash ? room : input.cash;
}
