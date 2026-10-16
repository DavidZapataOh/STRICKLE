import { expect, test } from "@playwright/test";
import { audit } from "@strickle/gates";
import { createElement } from "react";
import { DepositView } from "../src/components/DepositView.tsx";
import { initialDeposit } from "../src/deposit/flow.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { depositText } from "../src/i18n/slices.ts";
import { renderWithAppCss } from "./support/render-audit.ts";

const chain = { id: "Ethereum", label: "Ethereum", usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" } };
const swap = { kind: "swap", source: chain, tokenIn: { symbol: "USDT", address: chain.usdt.address }, amountIn: 100_000_000n, estimatedOut: 99_864_356n, minOut: 99_365_034n, providerFee: 20_000n, slippageBps: 50, gas: { token: "ETH", amount: "0.000381" }, route: "SushiSwap Aggregator + a deliberately long second route name that must wrap" };
const bridge = { kind: "bridge", source: chain, speed: "fast", feeMode: "destination", fees: [{ kind: "forwarder", amount: 16_000n }, { kind: "provider", amount: 2_500n }], gas: null };
const quote = { network: "mainnet", sourceAddress: "0x1", vault: "0x2", amountSent: 100_000_000n, totalDebit: 100_000_000n, amountReceivedMin: 99_346_534n, exact: false, legs: [swap, bridge], expiresAt: null, opaque: null } as never;
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8";
const dictionaries = { en, es, "pt-br": pt } as const;

for (const lang of ["en", "es", "pt-br"] as const) {
  const t = depositText(dictionaries[lang] as typeof en);
  const states = {
    quote: { ...initialDeposit("mainnet"), step: "quote" as const, sourceId: "Ethereum", inputToken: "USDT" as const, quote },
    held: { ...initialDeposit("mainnet"), step: "held" as const, sourceId: "Ethereum", amount: 99_400_000n, swapTx: `0x${"ab".repeat(32)}` as const },
    failed: { ...initialDeposit("mainnet"), step: "failed" as const, error: "timeout" as const, burnTx: `0x${"ab".repeat(32)}` as const },
  };
  for (const [name, state] of Object.entries(states)) {
    test(`${lang} USDT ${name} fits every viewport`, async ({ page, baseURL }) => {
      await renderWithAppCss(page, baseURL as string, createElement(DepositView, { lang, t, state, wallets: [], vault: VAULT, onEvent: () => {} }), lang);
      expect(await audit(page)).toEqual([]);
    });
  }
}
