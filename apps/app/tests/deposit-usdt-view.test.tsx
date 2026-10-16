import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepositView } from "../src/components/DepositView.tsx";
import { initialDeposit } from "../src/deposit/flow.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import { depositText } from "../src/i18n/slices.ts";

const chain = { id: "Ethereum", label: "Ethereum", usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" } };
const swap = { kind: "swap", source: chain, tokenIn: { symbol: "USDT", address: chain.usdt.address }, amountIn: 100_000_000n, estimatedOut: 99_864_356n, minOut: 99_365_034n, providerFee: 20_000n, slippageBps: 50, gas: { token: "ETH", amount: "0.000381" }, route: "SushiSwap Aggregator" };
const bridge = { kind: "bridge", source: chain, speed: "fast", feeMode: "destination", fees: [{ kind: "forwarder", amount: 16_000n }, { kind: "provider", amount: 2_500n }], gas: null };
const quote = { network: "mainnet", sourceAddress: "0x1", vault: "0x2", amountSent: 100_000_000n, totalDebit: 100_000_000n, amountReceivedMin: 99_346_534n, exact: false, legs: [swap, bridge], expiresAt: null, opaque: null } as never;

const view = (state = initialDeposit("mainnet"), t: typeof en = en, lang: "en" | "es" | "pt-br" = "en") =>
  renderToStaticMarkup(<DepositView lang={lang} t={depositText(t)} state={state} wallets={[]} vault="0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" onEvent={() => {}} />);

describe("the USDT deposit screen", () => {
  it("offers USDT as an input only on a chain that lists it, and never on testnet", () => {
    const withChain = { ...initialDeposit("mainnet"), sourceId: "Ethereum" };
    expect(view(withChain)).toContain("USDT");
    expect(view({ ...initialDeposit("testnet"), sourceId: "Base_Sepolia" })).not.toContain("USDT");
  });

  it("shows the conversion fee, the worst case, the expected amount and every fee of the transfer", () => {
    const out = view({ ...initialDeposit("mainnet"), step: "quote", sourceId: "Ethereum", inputToken: "USDT", quote });
    expect(out).toContain("100.00 USDT"); // through formatTokenAmount (plan one's amount helpers): formatMoney knows only USDC and EURC
    expect(out).toContain("Conversion fee");
    expect(out).toContain("0.02 USDT");
    expect(out).toContain("Circle forwarding");
    expect(out).toContain("at least");
    expect(out).toContain("US$99.35"); // 99.346534 rounds half away from zero, like every other amount
    expect(out).toContain("SushiSwap Aggregator");
    expect(out).toContain("0.5%");
  });

  it("never states an exact amount for a conversion", () => {
    const out = view({ ...initialDeposit("mainnet"), step: "quote", sourceId: "Ethereum", inputToken: "USDT", quote });
    expect(out).not.toContain("exactly");
  });

  it("says plainly what happened and what to do when the conversion is done but the transfer is not", () => {
    const out = view({ ...initialDeposit("mainnet"), step: "held", received: null, amount: 99_400_000n, swapTx: `0x${"ab".repeat(32)}` });
    expect(out).toContain("Your USDT is now USDC in your wallet");
    expect(out).toContain("US$99.40");
    expect(out).toContain("Send it to your vault");
  });

  it("is rendered in Spanish from the same state", () => {
    const out = view({ ...initialDeposit("mainnet"), step: "held", amount: 99_400_000n, swapTx: `0x${"ab".repeat(32)}` }, es as typeof en, "es");
    expect(out).toContain("Tu USDT ya es USDC en tu billetera");
  });
});
