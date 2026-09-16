import { describe, expect, it } from "vitest";
import * as content from "./landing";

const all = JSON.stringify(content);

/** Words that speak to a judge or a developer, not to the buyer. */
const JARGON =
  /blockchain|zero-knowledge|\bzk\b|on[- ]chain|ledger|consensus|circuit|witness|prover|nullifier|merkle|hash|cryptograph|smart contract|compact\b/i;

describe("landing copy speaks to the buyer", () => {
  it("never says anonymity, score or claim-as-noun", () => {
    expect(all.toLowerCase()).not.toMatch(/anonymous|anonymity|\bscore\b|\bclaims?\b/);
  });

  it("names no mechanism anywhere the buyer reads", () => {
    const buyerFacing = JSON.stringify({ ...content, SECTIONS: undefined, footer: undefined });
    expect(buyerFacing).not.toMatch(JARGON);
  });

  it("keeps Midnight to the footer line and the passport screen's own footer", () => {
    const rest = JSON.stringify({
      ...content,
      SECTIONS: undefined,
      footer: undefined,
      bench: { ...content.bench, passport: undefined },
    });
    expect(rest).not.toMatch(/midnight/i);
  });

  it("gives every section a unique anchor the nav can reach", () => {
    const ids = content.SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of content.NAV) expect(ids).toContain(n.href.slice(1));
  });

  it("cites every legal clause with an article or annex", () => {
    for (const cl of content.law.clauses) expect(cl.ref).toMatch(/^(Art\.|Annex)/);
    for (const k of content.law.clocks) expect(k.ref).toMatch(/^Art\./);
  });

  it("writes the absence of data out in the passport and keeps suppliers confidential in the marks", () => {
    const values = content.bench.passport.rows.map(([, v]) => v);
    expect(values.filter((v) => v === "not disclosed").length).toBeGreaterThanOrEqual(2);
    expect(content.marks.items[0].glyph).toBe("sealed");
    expect(content.marks.items[0].meaning).toMatch(/confidential/i);
  });

  it("reserves the verdict word for the control mark", () => {
    const verdictMarks = content.marks.items.filter((m) => m.verdict);
    expect(verdictMarks).toHaveLength(1);
    expect(verdictMarks[0].name).toBe("Compliant");
  });

  it("answers the buyer's first fear first", () => {
    expect(content.questions.items[0].q).toMatch(/platform/i);
  });
});
