import { describe, expect, it } from "vitest";
import * as content from "./landing";

const all = JSON.stringify(content);

describe("landing copy", () => {
  it("never says anonymity, score or claim-as-noun", () => {
    expect(all.toLowerCase()).not.toMatch(/anonymous|anonymity|\bscore\b|\bclaims?\b/);
  });

  it("says blockchain only in the questions and zero-knowledge only once", () => {
    const outside = JSON.stringify({ ...content, questions: undefined, SECTIONS: undefined }).toLowerCase();
    expect(outside).not.toContain("blockchain");
    expect((JSON.stringify({ ...content, SECTIONS: undefined }).match(/zero-knowledge/gi) ?? []).length).toBe(1);
  });

  it("keeps the mechanism out of every section title", () => {
    const titles = content.SECTIONS.map((s) => s.title).join(" ");
    expect(titles).not.toMatch(/midnight|blockchain|zero-knowledge/i);
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

  it("writes the absence of data out in the passport and seals the supplier mark", () => {
    const values = content.bench.passport.rows.map(([, v]) => v);
    expect(values.filter((v) => v === "not disclosed").length).toBeGreaterThanOrEqual(2);
    expect(content.marks.items[0].glyph).toBe("sealed");
  });

  it("reserves the verdict word for the control mark", () => {
    const verdictMarks = content.marks.items.filter((m) => m.verdict);
    expect(verdictMarks).toHaveLength(1);
    expect(verdictMarks[0].name).toBe("Compliant");
  });
});
