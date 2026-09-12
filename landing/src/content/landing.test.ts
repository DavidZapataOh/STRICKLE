import { describe, expect, it } from "vitest";
import * as content from "./landing";

const all = JSON.stringify(content);

describe("landing copy", () => {
  it("never says anonymity, score or claim-as-noun", () => {
    expect(all.toLowerCase()).not.toMatch(/anonymous|anonymity|\bscore\b|\bclaims?\b/);
  });

  it("says blockchain only in the FAQ and zero-knowledge only once", () => {
    const outsideFaq = JSON.stringify({ ...content, faq: undefined }).toLowerCase();
    expect(outsideFaq).not.toContain("blockchain");
    expect((all.match(/zero-knowledge/gi) ?? []).length).toBe(1);
  });

  it("keeps Midnight out of every section title", () => {
    const titles = [content.regulation, content.how, content.surfaces, content.ledger, content.limits, content.faq, content.closing]
      .flatMap((s) => s.title)
      .join(" ");
    expect(titles).not.toMatch(/midnight|blockchain|zero-knowledge/i);
  });

  it("gives every section a unique anchor that the nav can reach", () => {
    const ids = [content.regulation, content.how, content.surfaces, content.ledger, content.limits, content.faq, content.closing].map(
      (s) => s.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of content.NAV) expect(ids).toContain(n.href.slice(1));
  });

  it("cites every legal clause with an article or annex", () => {
    for (const cl of content.regulation.clauses) expect(cl.ref).toMatch(/^(Art\.|Annex)/);
    for (const k of content.regulation.clocks) expect(k.ref).toMatch(/^Art\./);
  });

  it("writes the absence of data out in the passport", () => {
    const values = content.surfaces.passport.rows.map(([, v]) => v);
    expect(values.filter((v) => v === "not disclosed").length).toBeGreaterThanOrEqual(2);
  });
});
