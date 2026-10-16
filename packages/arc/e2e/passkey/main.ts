import { openPasskeyWallet, type PasskeyWallet } from "../../src/passkey.ts";

declare const __CLIENT_KEY__: string;

let wallet: PasskeyWallet | undefined;

(window as unknown as { passkey: unknown }).passkey = {
  async open(mode: "register" | "login", username?: string) {
    wallet = await openPasskeyWallet({ clientKey: __CLIENT_KEY__, mode, username });
    return wallet.address;
  },
  sendCalls(calls: { to: `0x${string}`; data: `0x${string}`; value?: string }[], options?: { sponsored?: boolean }) {
    if (!wallet) throw new Error("open a wallet first");
    return wallet.sendCalls(calls.map((call) => ({ to: call.to, data: call.data, value: call.value === undefined ? undefined : BigInt(call.value) })), options);
  },
  transfer(to: `0x${string}`, amount: string) {
    if (!wallet) throw new Error("open a wallet first");
    return wallet.transfer(to, amount);
  },
  async signTypedData(typed: { domain: Parameters<PasskeyWallet["signTypedData"]>[0]["domain"]; types: Record<string, readonly { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> }) {
    if (!wallet) throw new Error("open a wallet first");
    const message = { ...typed.message, nonce: BigInt(String(typed.message.nonce)), deadline: BigInt(String(typed.message.deadline)) };
    return wallet.signTypedData({ ...typed, message });
  },
};
