import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicView } from "../src/components/PublicView.tsx";
import { ShareLink } from "../src/components/ShareLink.tsx";
import en from "../src/i18n/dictionaries/en.json";
import type { VaultState } from "../src/chain/vault.ts";

const vault: VaultState = {
  boxes: [1, 2, 3, 4, 5, 6].map((id) => ({
    kind: (["taxes", "payroll", "salary", "operating", "emergency", "profit"] as const)[id - 1]!, id,
    usdc: BigInt(id) * 1_000_000n, eurc: 0n, invested: 0n,
    rule: { delaySeconds: id === 1 ? 172_800 : 0, alwaysDelayed: id === 1, restricted: false, floor: 0n, lockedUntil: 0 },
  })),
  unallocatedUsdc: 0n, agent: "0x00000000000000000000000000000000000000dd", agentPaused: false, now: 1_800_000_000, conversions: { supported: false },
};
const render = (state: Parameters<typeof PublicView>[0]["state"]) => renderToStaticMarkup(<PublicView lang="en" t={en} state={state} />);

describe("PublicView", () => {
  it("says everything on the page is public and shows only chain data", () => {
    const out = render({ status: "ready", vault, payments: [], activity: "ok", now: vault.now });
    // React escapes apostrophes in markup
    expect(out).toContain(en.view.publicBanner.replaceAll("'", "&#x27;"));
    expect(out).toContain("US$21.00");
    expect(out).toContain("Withdrawals wait 48 h");
  });

  it("shows an honest empty state for a vault with no payments and an unavailable history", () => {
    expect(render({ status: "ready", vault, payments: [], activity: "ok", now: vault.now })).toContain(en.view.noPayments);
    expect(render({ status: "ready", vault, payments: [], activity: "unavailable", now: vault.now })).toContain(en.view.historyUnavailable);
  });

  it("has loading, error and not-found states", () => {
    expect(render({ status: "loading" })).toContain("skeleton");
    expect(render({ status: "error" })).toContain(en.view.error);
    expect(render({ status: "notfound" })).toContain(en.view.notFound);
  });
});

describe("ShareLink", () => {
  it("shows the link in a read-only field with a copy button", () => {
    const out = renderToStaticMarkup(<ShareLink href="https://app.strickle.xyz/en/view/0x00000000000000000000000000000000000000a1" t={en} />);
    expect(out).toMatch(/readonly/i);
    expect(out).toContain(en.view.copy);
  });
});
