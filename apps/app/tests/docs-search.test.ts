import { describe, expect, it } from "vitest";
import { search } from "../src/docs/search.ts";

describe("documentation search", () => {
  it("finds a section by a word of its text", () => {
    expect(search("en", "salary").some((hit) => hit.section.id === "salary")).toBe(true);
  });

  it("ignores accents and case", () => {
    const withAccent = search("es", "Cómo").map((hit) => hit.section.id);
    expect(search("es", "como").map((hit) => hit.section.id)).toEqual(withAccent);
    expect(search("es", "PRIVADO").some((hit) => hit.topic.slug === "privacy")).toBe(true);
  });

  it("requires every word", () => {
    expect(search("en", "salary pool").length).toBe(0);
    expect(search("en", "private pool").length).toBeGreaterThan(0);
  });

  it("returns nothing for no match, an empty query or a very long one", () => {
    expect(search("en", "zzzqqq")).toEqual([]);
    expect(search("en", "   ")).toEqual([]);
    expect(search("en", "a".repeat(500))).toEqual([]);
  });

  it("treats markup in the query as plain text", () => {
    expect(search("en", "<b>salary</b>")).toEqual([]);
  });
});
