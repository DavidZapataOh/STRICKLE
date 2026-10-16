import { formatPlainDate, plainDate } from "@strickle/core";
import { describe, expect, it } from "vitest";
import { dueDates, loadRules } from "../src/index.ts";

const rules = loadRules(new URL("../rules", import.meta.url).pathname);
const rule = (id: string) => {
  const found = rules.find((entry) => entry.id === id);
  if (!found) throw new Error(`no rule ${id}`);
  return found;
};
const text = (dates: ReturnType<typeof dueDates>) => dates.map(formatPlainDate);
const today = plainDate(2026, 10, 15);

describe("dueDates", () => {
  it("lists a monthly rule's day, counting today when today is the day", () => {
    expect(text(dueDates(rule("mx-resico-pf"), today, 3))).toEqual(["2026-10-17", "2026-11-17", "2026-12-17"]);
    expect(text(dueDates(rule("mx-resico-pf"), plainDate(2026, 10, 17), 2))).toEqual(["2026-10-17", "2026-11-17"]);
    expect(text(dueDates(rule("mx-resico-pf"), plainDate(2026, 10, 18), 1))).toEqual(["2026-11-17"]);
  });
  it("covers the monotributo and the MEI and crosses the year end", () => {
    expect(text(dueDates(rule("ar-monotributo"), plainDate(2026, 12, 21), 2))).toEqual(["2027-01-20", "2027-02-20"]);
    expect(text(dueDates(rule("br-mei"), today, 1))).toEqual(["2026-10-20"]);
  });
  it("lists the installments still ahead for the US and the quarters and annual date for the Philippines", () => {
    expect(text(dueDates(rule("us-estimated-tax-safe-harbor"), today, 4))).toEqual(["2027-01-15"]);
    expect(text(dueDates(rule("ph-eight-percent"), today, 4))).toEqual(["2026-11-15", "2027-04-15"]);
  });
  it("returns nothing where the rule carries no payment dates", () => {
    for (const id of ["co-simple-professional", "pk-export-of-services", "mx-export-services-vat", "fallback-effective-rate"]) {
      expect(dueDates(rule(id), today, 3)).toEqual([]);
    }
  });
  it("returns nothing for a count of zero", () => {
    expect(dueDates(rule("mx-resico-pf"), today, 0)).toEqual([]);
  });
});
