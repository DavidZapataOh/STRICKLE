export interface RatePoint {
    date: string;
    rate: number;
}
export interface FxSource {
    kind: "socrata-trm" | "argentinadatos" | "frankfurter";
    url: string;
    /** Argentinadatos only: which quote of the row to use. */
    field?: string;
    floorBps: number;
    source: {
        title: string;
        url: string;
        retrievedOn: string;
    };
}
/** Colombia's TRM from datos.gov.co: one point per validity start (a Friday's rate also covers the weekend). */
export declare function parseSocrataTrm(rows: unknown): RatePoint[];
/** Argentina's USD quotes from argentinadatos.com (calendar days): weekdays only, using the chosen field. */
export declare function parseArgentinaDatos(rows: unknown, field: string): RatePoint[];
/** ECB reference rates through Frankfurter, USD base. */
export declare function parseFrankfurter(payload: {
    rates?: Record<string, Record<string, number>>;
}, currency: string): RatePoint[];
export declare const rateValues: (points: readonly RatePoint[]) => number[];
export declare function loadFxSources(path: string): Record<string, FxSource>;
/** Downloads the daily series of a currency from its source, from `from` (YYYY-MM-DD) to today. */
export declare function fetchSeries(source: FxSource, from: string, currency: string): Promise<RatePoint[]>;
