// Two tabs of the same browser must not decide the same proposal at once: the second would sign for nothing and spend a gateway slot.
// The Web Locks API is shared across the tabs of one origin; where it does not exist the relay's per-vault slot is the only guard.
export async function withProposalLock<T>(proposalId: string, work: () => Promise<T>, locks: Pick<LockManager, "request"> | undefined = typeof navigator === "undefined" ? undefined : navigator.locks): Promise<{ ran: true; value: T } | { ran: false }> {
  if (!locks) return { ran: true, value: await work() };
  const result = await locks.request(`strickle:decide:${proposalId}`, { ifAvailable: true }, async (lock) => (lock ? { ran: true as const, value: await work() } : { ran: false as const }));
  return result as { ran: true; value: T } | { ran: false };
}
