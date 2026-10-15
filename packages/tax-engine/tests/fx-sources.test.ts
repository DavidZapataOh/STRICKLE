import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadFxSources, parseArgentinaDatos, parseFrankfurter, parseSocrataTrm, rateValues } from "../src/index.ts";

const sample = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("parseSocrataTrm (real datos.gov.co response)", () => {
  const points = parseSocrataTrm(sample("trm-cop-sample.json"));
  it("returns one ascending point per TRM validity start", () => {
    expect(points[0]).toEqual({ date: "2026-08-01", rate: 3144.14 });
    expect(points.length).toBe(50);
    expect(points.every((p, i) => i === 0 || p.date > points[i - 1]!.date)).toBe(true);
  });
  it("rejects an empty payload and a non-positive or non-numeric rate", () => {
    expect(() => parseSocrataTrm([])).toThrow(/empty/);
    expect(() => parseSocrataTrm([{ valor: "0", vigenciadesde: "2026-08-01T00:00:00.000" }])).toThrow(/rate/);
    expect(() => parseSocrataTrm([{ valor: "abc", vigenciadesde: "2026-08-01T00:00:00.000" }])).toThrow(/rate/);
    expect(() => parseSocrataTrm({} as never)).toThrow(/list/);
  });
});

describe("parseArgentinaDatos (real argentinadatos.com response)", () => {
  const points = parseArgentinaDatos(sample("mep-ars-sample.json"), "compra");
  it("keeps weekdays only, ascending, using the chosen field", () => {
    expect(points[0]).toEqual({ date: "2026-09-01", rate: 1534.9 });
    expect(points.some((p) => p.date === "2026-09-05")).toBe(false);
    expect(points.some((p) => p.date === "2026-09-04")).toBe(true);
    expect(points.every((p, i) => i === 0 || p.date > points[i - 1]!.date)).toBe(true);
  });
  it("rejects an empty payload and a bad rate", () => {
    expect(() => parseArgentinaDatos([], "compra")).toThrow(/empty/);
    expect(() => parseArgentinaDatos([{ fecha: "2026-09-01", compra: -1 }], "compra")).toThrow(/rate/);
  });
});

describe("parseFrankfurter (real ECB response)", () => {
  it("returns ascending points for the currency", () => {
    const points = parseFrankfurter(sample("ecb-mxn-sample.json"), "MXN");
    expect(points.length).toBeGreaterThan(10);
    expect(points.every((p, i) => i === 0 || p.date > points[i - 1]!.date)).toBe(true);
    expect(rateValues(points)).toHaveLength(points.length);
  });
  it("rejects a payload without the currency", () => {
    expect(() => parseFrankfurter(sample("ecb-mxn-sample.json"), "COP")).toThrow(/COP/);
  });
});

describe("loadFxSources", () => {
  const sources = loadFxSources(new URL("../fx/sources.json", import.meta.url).pathname);
  it("has a floor and an https source for every currency", () => {
    expect(Object.keys(sources).sort()).toEqual(["ARS", "BRL", "COP", "MXN"]);
    for (const source of Object.values(sources)) {
      expect(source.source.url.startsWith("https://")).toBe(true);
      expect(source.floorBps).toBeGreaterThanOrEqual(0);
    }
    expect(sources.COP!.floorBps).toBe(600);
    expect(sources.ARS!.floorBps).toBe(800);
  });
});
