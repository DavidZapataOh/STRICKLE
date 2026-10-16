import type { Page } from "@playwright/test";
import { type Chain, type Hex, createPublicClient, createWalletClient, http, numberToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";

class WalletError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

/** A real EIP-1193 wallet in Node: it signs with viem and talks to each chain's own RPC. With `signing: false` it refuses every signature and never touches a chain, so a responsive spec cannot move funds. */
export function createHeadlessWallet(options: { privateKey: Hex; chains: readonly Chain[]; signing?: boolean }) {
  const account = privateKeyToAccount(options.privateKey);
  const signing = options.signing ?? true;
  let active = options.chains[0];
  if (!active) throw new Error("a headless wallet needs at least one chain");

  const chainFor = (id: number) => {
    const found = options.chains.find((chain) => chain.id === id);
    if (!found) throw new WalletError(4902, `chain ${id} is not configured`);
    return found;
  };

  async function handle(method: string, params: unknown[] = []): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return numberToHex(active?.id ?? 0);
      case "wallet_switchEthereumChain": {
        active = chainFor(Number.parseInt((params[0] as { chainId: string }).chainId, 16));
        return null;
      }
      case "eth_sendTransaction": {
        if (!signing) throw new WalletError(4001, "User rejected the request.");
        const tx = params[0] as { to: `0x${string}`; data?: Hex; value?: Hex };
        const client = createWalletClient({ account, chain: active, transport: http() });
        return client.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined });
      }
      case "personal_sign": {
        if (!signing) throw new WalletError(4001, "User rejected the request.");
        return account.signMessage({ message: { raw: params[0] as Hex } });
      }
      case "eth_signTypedData_v4": {
        if (!signing) throw new WalletError(4001, "User rejected the request.");
        const typed = JSON.parse(params[1] as string) as Parameters<typeof account.signTypedData>[0];
        return account.signTypedData(typed);
      }
      default: {
        if (!signing) throw new WalletError(4200, `${method} is not available in this wallet`);
        return createPublicClient({ chain: active, transport: http() }).request({ method, params } as never);
      }
    }
  }

  return {
    address: account.address,
    async install(page: Page): Promise<void> {
      await page.exposeBinding("__walletRequest", async (_source, request: { method: string; params?: unknown[] }) => {
        try {
          return { result: await handle(request.method, request.params) };
        } catch (error) {
          const failure = error as { code?: number; message?: string; shortMessage?: string };
          return { error: { code: failure.code ?? -32603, message: failure.shortMessage ?? failure.message ?? "wallet error" } };
        }
      });
      await page.addInitScript(
        ({ address, icon }) => {
          const provider = {
            request: async (request: { method: string; params?: unknown[] }) => {
              const answer = await (window as never as { __walletRequest(r: unknown): Promise<{ result?: unknown; error?: { code: number; message: string } }> }).__walletRequest(request);
              if (answer.error) throw Object.assign(new Error(answer.error.message), { code: answer.error.code });
              return answer.result;
            },
            on: () => provider,
            removeListener: () => provider,
          };
          const announce = () =>
            window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: Object.freeze({ uuid: "headless-wallet", name: "Headless", icon, rdns: "xyz.strickle.headless" }), provider }) }));
          window.addEventListener("eip6963:requestProvider", announce);
          (window as never as { __announce: () => void; __walletAddress: string }).__announce = announce;
          (window as never as { __walletAddress: string }).__walletAddress = address;
        },
        { address: account.address, icon: ICON },
      );
    },
  };
}
