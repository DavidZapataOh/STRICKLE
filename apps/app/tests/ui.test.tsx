import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Amount } from "../src/ui/Amount.tsx";
import { Button } from "../src/ui/Button.tsx";
import { Chip } from "../src/ui/Chip.tsx";
import { EmptyState } from "../src/ui/EmptyState.tsx";
import { ListRow } from "../src/ui/ListRow.tsx";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Amount", () => {
  it("formats by locale and carries the sign as text", () => {
    expect(html(<Amount units={1_800_000_000n} locale="en" />)).toContain("US$1,800.00");
    expect(html(<Amount units={1_800_000_000n} locale="pt-br" />)).toContain("US$ 1.800,00");
    expect(html(<Amount units={250_000_000n} locale="en" signed tone="positive" />)).toContain("+US$250.00");
    expect(html(<Amount units={-40_000_000n} locale="en" signed tone="loss" />)).toContain("−US$40.00");
  });

  it("marks its tone for styling without replacing the sign", () => {
    expect(html(<Amount units={1n} locale="en" tone="positive" />)).toContain('data-tone="positive"');
    expect(html(<Amount units={1n} locale="en" />)).toContain('data-tone="neutral"');
  });
});

describe("Button", () => {
  it("renders a link when it has an href and a button otherwise", () => {
    expect(html(<Button href="/en/boxes">Open</Button>)).toMatch(/^<a [^>]*href="\/en\/boxes"/);
    expect(html(<Button>Save</Button>)).toMatch(/^<button [^>]*type="button"/);
  });

  it("is disabled for real, not just in style", () => {
    expect(html(<Button disabled>Save</Button>)).toContain("disabled");
  });
});

describe("Chip", () => {
  it("keeps the Calyx tone as an explicit choice", () => {
    expect(html(<Chip tone="calyx">Secured</Chip>)).toContain('data-tone="calyx"');
    expect(html(<Chip>Pending</Chip>)).toContain('data-tone="neutral"');
  });
});

describe("ListRow", () => {
  it("shows the title, the rule and the value in that reading order", () => {
    const out = html(<ListRow title="Taxes set aside" rule="18% of each payment" trailing="US$270.00" />);
    expect(out.indexOf("Taxes set aside")).toBeLessThan(out.indexOf("18% of each payment"));
    expect(out.indexOf("18% of each payment")).toBeLessThan(out.indexOf("US$270.00"));
  });

  it("is a single link when it has an href", () => {
    expect(html(<ListRow title="Salary" href="/en/activity" />)).toMatch(/<a [^>]*href="\/en\/activity"/);
  });
});

describe("EmptyState", () => {
  it("teaches what will appear: a heading and a sentence", () => {
    const out = html(<EmptyState title="Every move gets a receipt" body="You will see what the agent did." />);
    expect(out).toMatch(/<h2[^>]*>Every move gets a receipt<\/h2>/);
    expect(out).toContain("You will see what the agent did.");
  });
});
