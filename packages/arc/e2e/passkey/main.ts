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
};
