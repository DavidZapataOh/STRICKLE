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

export const MODULAR_URL = "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

export interface PasskeyWallet {
  address: Address;
  /** Sends USDC with gas sponsored by Circle's paymaster; resolves with the transaction hash. */
  transfer(to: Address, amount: string): Promise<Hex>;
}

/** Registers a new passkey (`register`) or signs a returning user in (`login`) and opens their smart account on Arc testnet. */
export async function openPasskeyWallet(args: {
  clientKey: string;
  mode: "register" | "login";
  username: string;
  clientUrl?: string;
}): Promise<PasskeyWallet> {
  if (!args.clientKey) throw new Error("a Circle client key is required");
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

  return {
    address: account.address,
    async transfer(to, amount) {
      const { to: token, data } = encodeTransfer(to, ContractAddress.ArcTestnet_USDC, parseUnits(amount, 6));
      const hash = await bundler.sendUserOperation({ calls: [{ to: token, data }], paymaster: true });
      const { receipt } = await bundler.waitForUserOperationReceipt({ hash });
      return receipt.transactionHash;
    },
  };
}
