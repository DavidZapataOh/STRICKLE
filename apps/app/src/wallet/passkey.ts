import type { PasskeyWallet } from "@strickle/arc/passkey";

export type { PasskeyWallet };

/** Loaded only when the user reaches the account step, so no other route pays for the wallet SDK. */
export async function connectWallet(mode: "register" | "login", username?: string): Promise<PasskeyWallet> {
  const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY;
  if (!clientKey) throw new Error("the wallet is not configured");
  if (typeof window === "undefined" || !window.PublicKeyCredential) throw new Error("passkeys are not supported here");
  const { assertRegistrationName, openPasskeyWallet } = await import("@strickle/arc/passkey");
  assertRegistrationName(mode, username);
  return openPasskeyWallet({ clientKey, mode, username });
}
