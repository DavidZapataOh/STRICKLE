import { type Session, saveSession } from "./session";
import { getAddress, zeroAddress } from "viem";
import { factoryAbi } from "@/chain/abi";
import { getPublicClient } from "@/chain/client";
import { deploymentsFor } from "@/config/network";
import { connectWallet } from "@/wallet/passkey";

/** Signs a returning user in with their passkey. A passkey whose owner has no vault is not an account yet: the result says so instead of inventing one. */
export async function signInWithPasskey(): Promise<Session | "no-account"> {
  const wallet = await connectWallet("login");
  const owner = getAddress(wallet.address);
  const vault = getAddress(await getPublicClient().readContract({ address: deploymentsFor().BoxVaultFactory, abi: factoryAbi, functionName: "vaultOf", args: [owner] }));
  if (vault === zeroAddress) return "no-account";
  const session: Session = { owner, vault, username: "", createdAt: Math.floor(Date.now() / 1000) };
  saveSession(session);
  return session;
}
