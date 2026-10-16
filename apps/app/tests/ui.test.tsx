import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChoiceGroup } from "../src/ui/ChoiceGroup.tsx";
import { NumberField } from "../src/ui/NumberField.tsx";
import { SplitBar } from "../src/ui/SplitBar.tsx";
import { StartFrame } from "../src/ui/StartFrame.tsx";
import en from "../src/i18n/dictionaries/en.json";
import { ReceiptStrip } from "../src/components/ReceiptStrip.tsx";
import type { TimelineProposal } from "../src/activity/timeline.ts";
import { ProposalCard } from "../src/components/ProposalCard.tsx";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("SplitBar", () => {
  const parts = [
    { key: "taxes", label: "Taxes", units: 640_000_000n },
    { key: "salary", label: "Salary", units: 960_000_000n },
  ];

  it("states every part in words and numbers, so color is never the only signal", () => {
    const out = html(<SplitBar parts={parts} total={1_600_000_000n} locale="en" />);
    for (const text of ["Taxes", "40%", "US$640.00", "60%"]) expect(out).toContain(text);
  });

  it("sizes the segments by their share and exposes the whole as an image with a label", () => {
    const out = html(<SplitBar parts={parts} total={1_600_000_000n} locale="en" />);
    expect(out).toContain("flex-grow:640000000");
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Taxes 40%, Salary 60%"');
  });

  it("skips empty parts", () => {
    expect(html(<SplitBar parts={[...parts, { key: "profit", label: "Profit", units: 0n }]} total={1_600_000_000n} locale="en" />)).not.toContain("Profit");
  });

  it("writes the amounts in the currency of the payment it divides", () => {
    expect(html(<SplitBar parts={parts} total={1_600_000_000n} locale="en" asset="EURC" />)).toContain("€640.00");
  });
});

describe("ChoiceGroup", () => {
  const options = [
    { value: "stablecoin" as const, label: "In digital dollars", hint: "USDC" },
    { value: "bank" as const, label: "Through a bank" },
  ];

  it("is a fieldset with a legend and one radio per option, the chosen one checked", () => {
    const out = html(<ChoiceGroup name="collection" legend="How do you get paid?" options={options} value="bank" onChange={() => undefined} />);
    expect(out).toMatch(/<fieldset[^>]*><legend>How do you get paid\?<\/legend>/);
    expect(out.match(/type="radio"/g)).toHaveLength(2);
    const checked = [...out.matchAll(/<input[^>]*>/g)].filter((match) => match[0].includes('checked=""')).map((match) => /value="([^"]+)"/.exec(match[0])?.[1]);
    expect(checked).toEqual(["bank"]);
    expect(out).toContain("USDC");
  });

  it("ties its error to the group for assistive technology", () => {
    const out = html(<ChoiceGroup name="collection" legend="L" options={options} value={null} onChange={() => undefined} error="Choose one." />);
    expect(out).toContain('aria-describedby="collection-error"');
    expect(out).toContain('role="alert"');
  });
});

describe("NumberField", () => {
  it("labels its input and starts from the value as digits", () => {
    const out = html(<NumberField id="income" label="Monthly income" value={3200} locale="en" onValue={() => undefined} />);
    expect(out).toContain('<label for="income">Monthly income</label>');
    expect(out).toContain('value="3200"');
    expect(out).toContain('inputMode="numeric"');
  });

  it("describes the field by its hint and its error", () => {
    const out = html(<NumberField id="goal" label="Goal" hint="US dollars" value={null} locale="pt-br" error="Enter a whole number." onValue={() => undefined} />);
    expect(out).toContain('aria-describedby="goal-hint goal-error"');
    expect(out).toContain('aria-invalid="true"');
  });
});

describe("StartFrame", () => {
  it("has a skip link, the brand, the progress text and the test-network notice", () => {
    const out = html(<StartFrame lang="en" brand="Strickle" skip="Skip to content" progress="Step 2 of 6" testnet="Test network: no real money">content</StartFrame>);
    expect(out.indexOf("skip-link")).toBeLessThan(out.indexOf("<header"));
    expect(out).toContain("Step 2 of 6");
    expect(out).toContain("Test network: no real money");
    expect(out).toContain('<main id="content"');
  });

  it("omits the notice on a network with real money", () => {
    expect(html(<StartFrame lang="en" brand="Strickle" skip="s" progress={null} testnet={null}>x</StartFrame>)).not.toContain("Test network");
  });
});

describe("ReceiptStrip", () => {
  const receipt = {
    type: "receipt" as const,
    id: "0xabc:5",
    at: 1_800_000_000,
    kind: "split" as const,
    ruleId: "cascade" as const,
    text: "US$1,000.00 struck level",
    parts: [{ box: "taxes" as const, units: 200_000_000n }, { box: "operating" as const, units: 800_000_000n }],
    total: 1_000_000_000n,
    txHash: `0x${"11".repeat(32)}` as const,
    undo: { undoable: false as const, reason: "split" as const },
  };

  it("shows what happened, the split by box with amounts as text, the rule and why it cannot be undone", () => {
    const out = renderToStaticMarkup(<ReceiptStrip receipt={receipt} locale="en" t={en} />);
    expect(out).toContain("US$1,000.00 struck level");
    expect(out).toContain("US$200.00");
    expect(out).toContain("US$800.00");
    expect(out).toContain(en.activity.receipt.rules.cascade);
    expect(out).toContain(en.activity.receipt.undo.split);
    expect(out).not.toMatch(/>Undo</);
  });

  it("explains that the percentage in a split is this payment's share, not the user's tax rate", () => {
    // React escapes the apostrophe in markup
    expect(renderToStaticMarkup(<ReceiptStrip receipt={receipt} locale="en" t={en} />)).toContain(en.activity.receipt.rateNote.replaceAll("'", "&#x27;"));
  });

  it("links to the transaction on the network's explorer", () => {
    expect(renderToStaticMarkup(<ReceiptStrip receipt={receipt} locale="en" t={en} />)).toContain(`/tx/${"0x" + "11".repeat(32)}`);
  });
});

describe("ProposalCard", () => {
  const now = 1_800_000_000;
  const proposal = { type: "proposal" as const, proposalId: "salary-2026-11", amount: 1_800_000_000n, payee: "0x00000000000000000000000000000000000000b2" as const, payeeRaw: "0x00000000000000000000000000000000000000b2", amountRaw: "1800000000", digest: `0x${"ab".repeat(32)}` as const, verified: true, createdAt: 1_799_990_000, expiresAt: 1_800_604_800, state: "pending" as TimelineProposal["state"], decidedAt: null };
  const render = (patch: Partial<typeof proposal> = {}, props: { phase?: "idle" | "waiting"; paused?: boolean; reason?: undefined } = {}) =>
    renderToStaticMarkup(<ProposalCard proposal={{ ...proposal, ...patch }} locale="en" t={en} phase={props.phase ?? "idle"} paused={props.paused ?? false} now={now} onApprove={() => {}} onReject={() => {}} />);

  it("shows the exact payment and the fingerprint the signature covers, with both decisions enabled", () => {
    const out = render();
    expect(out).toContain("US$1,800.00");
    expect(out).toContain("abababab…abababab");
    expect(out).toContain(en.activity.proposal.approve);
    expect(out).toContain(en.activity.proposal.reject);
    expect(out).not.toContain("disabled");
  });

  it("disables both decisions while a request is in flight and announces the phase politely", () => {
    const out = render({}, { phase: "waiting" });
    expect(out.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain(en.activity.phase.waiting);
  });

  it("offers no decision button at all on an expired or decided proposal", () => {
    for (const state of ["expired", "rejected", "executed"] as const) {
      expect(render({ state })).not.toMatch(/<button/);
    }
  });

  it("does not let a proposal whose digest does not match be approved, and says so", () => {
    const out = render({ verified: false });
    expect(out).toContain(en.activity.proposal.unverified);
    expect(out).not.toContain(en.activity.proposal.approve);
  });

  it("does not offer approval when too little time is left, but still allows rejecting", () => {
    const out = render({ expiresAt: now + 60 });
    expect(out).toContain(en.activity.proposal.tooLate);
    expect(out).not.toContain(`>${en.activity.proposal.approve}<`);
    expect(out).toContain(en.activity.proposal.reject);
  });

  it("disables both decisions while the agent is paused and says how to resume", () => {
    const out = render({}, { paused: true });
    expect(out.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).toContain(en.activity.proposal.paused);
  });
});
