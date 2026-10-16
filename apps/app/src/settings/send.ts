import { isSponsorshipError } from "@strickle/arc/sponsorship";
import type { Hex } from "viem";
import { connectWallet } from "../wallet/passkey.ts";
import type { Account } from "./account.ts";
import type { Call } from "./calls.ts";

type Sender = { sendCalls(calls: readonly Call[], options?: { sponsored?: boolean }): Promise<Hex> };

export async function sendWithFallback(wallet: Sender, calls: readonly Call[], sponsorshipFailed: (error: unknown) => boolean): Promise<Hex> {
  try {
    return await wallet.sendCalls(calls);
  } catch (error) {
    if (!sponsorshipFailed(error)) throw error;
    return wallet.sendCalls(calls, { sponsored: false });
  }
}

export async function sendOwnerCalls(account: Account, calls: readonly Call[]): Promise<Hex> {
  const wallet = await connectWallet("login");
  return sendWithFallback(wallet, calls, isSponsorshipError);
}
