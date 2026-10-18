import { readFileSync } from "node:fs";
import { isoWeekday, parsePlainDate } from "@strickle/core";
const KINDS = ["socrata-trm", "argentinadatos", "frankfurter"];
function point(date, value) {
    const rate = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(rate) || rate <= 0)
        throw new RangeError(`not a valid rate on ${date}: ${String(value)}`);
    return { date, rate };
}
function ascending(points) {
    if (points.length === 0)
        throw new RangeError("the source returned an empty series");
    return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}
const isWeekday = (date) => isoWeekday(parsePlainDate(date)) < 6;
/** Colombia's TRM from datos.gov.co: one point per validity start (a Friday's rate also covers the weekend). */
export function parseSocrataTrm(rows) {
    if (!Array.isArray(rows))
        throw new RangeError("expected a list of TRM rows");
    return ascending(rows.map((row) => point(row.vigenciadesde.slice(0, 10), row.valor)));
}
/** Argentina's USD quotes from argentinadatos.com (calendar days): weekdays only, using the chosen field. */
export function parseArgentinaDatos(rows, field) {
    if (!Array.isArray(rows))
        throw new RangeError("expected a list of quotes");
    return ascending(rows.filter((row) => isWeekday(row.fecha)).map((row) => point(row.fecha, row[field])));
}
/** ECB reference rates through Frankfurter, USD base. */
export function parseFrankfurter(payload, currency) {
    const days = Object.entries(payload.rates ?? {});
    if (days.some(([, quote]) => !(currency in quote)))
        throw new RangeError(`the payload has no ${currency} quotes`);
    return ascending(days.map(([date, quote]) => point(date, quote[currency])));
}
export const rateValues = (points) => points.map((entry) => entry.rate);
export function loadFxSources(path) {
    const sources = JSON.parse(readFileSync(path, "utf8"));
    for (const [currency, source] of Object.entries(sources)) {
        if (!KINDS.includes(source.kind) || !source.url.startsWith("https://") || !source.source.url.startsWith("https://") || !Number.isInteger(source.floorBps) || source.floorBps < 0) {
            throw new RangeError(`${currency}: invalid rate source`);
        }
    }
    return sources;
}
async function getJson(url, name) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
}
/** Downloads the daily series of a currency from its source, from `from` (YYYY-MM-DD) to today. */
export async function fetchSeries(source, from, currency) {
    const name = `${source.kind} ${currency}`;
    switch (source.kind) {
        case "socrata-trm":
            return parseSocrataTrm(await getJson(`${source.url}?$where=vigenciadesde>='${from}'&$order=vigenciadesde&$limit=50000`, name));
        case "argentinadatos":
            return parseArgentinaDatos((await getJson(source.url, name)).filter((row) => row.fecha >= from), source.field ?? "compra");
        case "frankfurter": {
            const today = new Date().toISOString().slice(0, 10);
            return parseFrankfurter((await getJson(`${source.url}/${from}..${today}?base=USD&symbols=${currency}`, name)), currency);
        }
    }
}
