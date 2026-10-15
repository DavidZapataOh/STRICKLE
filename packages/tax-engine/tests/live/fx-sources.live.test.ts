import { describe, expect, it } from "vitest";
import { fetchSeries, loadFxSources } from "../../src/index.ts";

const sources = loadFxSources(new URL("../../fx/sources.json", import.meta.url).pathname);
const today = new Date();

describe.each(["COP", "ARS", "MXN", "BRL"])("%s rate source (live)", (currency) => {
  it("returns a long, ascending, recent series", async () => {
    const points = await fetchSeries(sources[currency]!, "2018-11-01", currency);
    expect(points.length).toBeGreaterThan(1500);
    expect(points.every((p, i) => i === 0 || p.date > points[i - 1]!.date)).toBe(true);
    const last = new Date(`${points.at(-1)!.date}T00:00:00Z`);
    expect((today.getTime() - last.getTime()) / 86_400_000).toBeLessThan(10);
  }, 60_000);
});
