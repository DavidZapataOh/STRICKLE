import { describe, expect, it } from "vitest";
import { discoverWallets } from "../src/wallet/injected.ts";

const provider = { request: async () => [] } as never;
const announce = (target: EventTarget, info: { uuid: string; name: string; icon: string; rdns: string }) =>
  target.addEventListener("eip6963:requestProvider", () => target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: Object.freeze(info), provider }) })));

describe("discoverWallets", () => {
  it("collects every wallet that announces itself, once each", async () => {
    const target = new EventTarget();
    announce(target, { uuid: "a", name: "Alpha", icon: "data:image/svg+xml;base64,AA==", rdns: "io.alpha" });
    announce(target, { uuid: "a", name: "Alpha", icon: "data:image/svg+xml;base64,AA==", rdns: "io.alpha" });
    announce(target, { uuid: "b", name: "Beta", icon: "data:image/png;base64,AA==", rdns: "io.beta" });
    const wallets = await discoverWallets(target, 20);
    expect(wallets.map((wallet) => wallet.name).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("returns an empty list when nothing announces", async () => {
    expect(await discoverWallets(new EventTarget(), 20)).toEqual([]);
  });

  it("ignores announcements with a malformed payload and icons that are not data images", async () => {
    const target = new EventTarget();
    target.addEventListener("eip6963:requestProvider", () => {
      target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "x", name: "Bad", icon: "https://tracker.example/i.png", rdns: "io.bad" }, provider } }));
      target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: null }));
    });
    expect(await discoverWallets(target, 20)).toEqual([]);
  });
});
