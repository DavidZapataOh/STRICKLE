import { describe, expect, it } from "vitest";
import { eventRows } from "../src/home/rows.ts";
import en from "../src/i18n/dictionaries/en.json";
import { planNotice } from "./fixtures-plan.ts";

const plan = planNotice({
  events: [
    { date: "2026-11-17", kind: "tax", amount: null },
    { date: "2026-11-20", kind: "payroll", amount: "300000000" },
    { date: "2026-12-01", kind: "salary", amount: "1800000000" },
  ],
});

describe("eventRows", () => {
  const rows = eventRows(plan, 270_000_000n, "en", en);

  it("keeps the notice's order and gives each kind its title and one-line rule", () => {
    expect(rows.map((row) => row.kind)).toEqual(["tax", "payroll", "salary"]);
    expect(rows[0]).toMatchObject({ title: "Taxes", rule: "About 18% of each payment", amount: null, reserved: 270_000_000n });
    expect(rows[1]).toMatchObject({ title: "Payroll reserve", rule: "Set aside before the date", amount: 300_000_000n, reserved: null });
    expect(rows[2]).toMatchObject({ title: "Salary", rule: "Same day, same amount", amount: 1_800_000_000n });
  });

  it("only the first tax row carries the amount set aside", () => {
    const two = eventRows({ ...plan, events: [plan.events[0]!, { date: "2026-12-17", kind: "tax", amount: null }] }, 5n, "en", en);
    expect(two.map((row) => row.reserved)).toEqual([5n, null]);
  });

  it("is empty for no events", () => {
    expect(eventRows({ ...plan, events: [] }, 0n, "en", en)).toEqual([]);
  });
});
