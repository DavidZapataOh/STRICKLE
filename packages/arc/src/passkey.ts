import {
  ContractAddress,
  WebAuthnMode,
  encodeTransfer,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, parseUnits, type Address, type Hex, type Transport } from "viem";
import { createBundlerClient, toWebAuthnAccount } from "viem/account-abstraction";
import { arcTestnet } from "viem/chains";

import { MODULAR_URL } from "./networks.ts";

export { MODULAR_URL };

export interface PasskeyCall {
  to: Address;
  data: Hex;
  value?: bigint;
}

export function toUserOperationCalls(calls: readonly PasskeyCall[]): { to: Address; data: Hex; value: bigint }[] {
  if (calls.length === 0) throw new Error("a batch needs at least one call");
  return calls.map((call) => ({ to: call.to, data: call.data, value: call.value ?? 0n }));
}

export function assertRegistrationName(mode: "register" | "login", username: string | undefined): void {
  if (mode === "register" && !username?.trim()) throw new Error("a registration needs a passkey name");
}

export { isSponsorshipError } from "./sponsorship.ts";

export interface PasskeyWallet {
  address: Address;
  /** Sends the calls as one user operation, sponsored unless `sponsored` is false; resolves with the transaction hash and throws if the operation failed. */
  sendCalls(calls: readonly PasskeyCall[], options?: { sponsored?: boolean }): Promise<Hex>;
  /** Sends USDC with gas sponsored by Circle's paymaster; resolves with the transaction hash. */
  transfer(to: Address, amount: string): Promise<Hex>;
}

/** Registers a new passkey (`register`) or signs a returning user in (`login`) and opens their smart account on Arc testnet. */
export async function openPasskeyWallet(args: {
  clientKey: string;
  mode: "register" | "login";
  username?: string;
  clientUrl?: string;
}): Promise<PasskeyWallet> {
  if (!args.clientKey) throw new Error("a Circle client key is required");
  assertRegistrationName(args.mode, args.username);
  const clientUrl = args.clientUrl ?? MODULAR_URL;
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(clientUrl, args.clientKey),
    mode: args.mode === "register" ? WebAuthnMode.Register : WebAuthnMode.Login,
    username: args.username,
  });
  // The SDK bundles its own viem typings; the runtime objects are the same.
  const transport = toModularTransport(`${clientUrl}/arcTestnet`, args.clientKey) as unknown as Transport;
  const client = createPublicClient({ chain: arcTestnet, transport });
  const account = await toCircleSmartAccount({ client: client as never, owner: toWebAuthnAccount({ credential }) });
  const bundler = createBundlerClient({ account, chain: arcTestnet, transport });

  const sendCalls: PasskeyWallet["sendCalls"] = async (calls, options) => {
    const hash = await bundler.sendUserOperation({ calls: toUserOperationCalls(calls), ...(options?.sponsored === false ? {} : { paymaster: true }) });
    const { receipt, success } = await bundler.waitForUserOperationReceipt({ hash });
    if (!success) throw new Error(`the user operation failed: ${receipt.transactionHash}`);
    return receipt.transactionHash;
  };

  return {
    address: account.address,
    sendCalls,
    async transfer(to, amount) {
      const { to: token, data } = encodeTransfer(to, ContractAddress.ArcTestnet_USDC, parseUnits(amount, 6));
      return sendCalls([{ to: token, data }]);
    },
  };
}
