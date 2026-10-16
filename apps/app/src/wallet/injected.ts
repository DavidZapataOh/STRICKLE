import type { EIP1193Provider } from "viem";

export interface InjectedWallet {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: EIP1193Provider;
}

const DATA_IMAGE = /^data:image\/(png|svg\+xml|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

/** EIP-6963: ask, then listen for a moment. Icons that are not inline images are dropped, because the page's policy allows no remote images and a wallet must not be able to track the page through one. */
export function discoverWallets(target: EventTarget = window, waitMs = 300): Promise<InjectedWallet[]> {
  const found = new Map<string, InjectedWallet>();
  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent).detail as { info?: Partial<InjectedWallet>; provider?: EIP1193Provider } | null;
    const info = detail?.info;
    if (!detail?.provider || !info?.uuid || !info.name || !info.rdns || !info.icon || !DATA_IMAGE.test(info.icon)) return;
    found.set(info.uuid, { uuid: info.uuid, name: info.name, icon: info.icon, rdns: info.rdns, provider: detail.provider });
  };
  target.addEventListener("eip6963:announceProvider", onAnnounce);
  target.dispatchEvent(new Event("eip6963:requestProvider"));
  return new Promise((resolve) =>
    setTimeout(() => {
      target.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve([...found.values()]);
    }, waitMs),
  );
}
