import { describe, expect, it } from "vitest";
import { CATEGORIES, classificationValid } from "../src/classification.ts";

describe("classificationValid", () => {
  it.each(CATEGORIES)("accepts %s", (label) => {
    expect(classificationValid({ category: label })).toBe(label);
  });
  it("normalizes case and surrounding whitespace", () => {
    expect(classificationValid({ category: "  Client-Payment " })).toBe("client-payment");
  });
  it.each([null, undefined, "supplier", 5, [], {}, { category: "pay everything now" }, { category: 7 }, { category: "" }, { label: "supplier" }])("falls back to uncategorized for %j", (raw) => {
    expect(classificationValid(raw)).toBe("uncategorized");
  });
});
