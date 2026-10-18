export interface PlainDate {
    readonly year: number;
    readonly month: number;
    readonly day: number;
}
export declare function daysInMonth(year: number, month: number): number;
export declare function plainDate(year: number, month: number, day: number): PlainDate;
export declare function parsePlainDate(text: string): PlainDate;
export declare function formatPlainDate({ year, month, day }: PlainDate): string;
export declare function toEpochDay({ year, month, day }: PlainDate): number;
export declare function fromEpochDay(epochDay: number): PlainDate;
export declare function addDays(date: PlainDate, days: number): PlainDate;
export declare function addMonths(date: PlainDate, months: number): PlainDate;
export declare function daysBetween(from: PlainDate, to: PlainDate): number;
export declare function isoWeekday(date: PlainDate): number;
