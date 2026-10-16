import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChoiceGroup } from "../src/ui/ChoiceGroup.tsx";
import { NumberField } from "../src/ui/NumberField.tsx";
import { SplitBar } from "../src/ui/SplitBar.tsx";
import { StartFrame } from "../src/ui/StartFrame.tsx";

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
