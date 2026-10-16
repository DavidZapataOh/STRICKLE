import type { PlanNotice } from "@strickle/agent/notice-schema";

export interface Stake {
  id: number;
  x: number;
  lane: number;
  date: string;
  kind: "salary" | "payroll" | "tax";
}
export interface Timeline {
  stakes: Stake[];
  p50: string;
  p10: string;
  floorY: number;
  band: string;
  empty: boolean;
  /** The cautious and the typical balance on the window's last day, in base units. */
  end: { low: bigint; mid: bigint } | null;
}

const HEIGHT = 40;
const DAY_MS = 86_400_000;
const WEEK = 7;
const LANES = 3;
const SAME_SPOT = 8;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const dollars = (units: string) => Number(BigInt(units)) / 1_000_000;
const round = (value: number) => Math.round(value * 100) / 100;

interface Point {
  day: number;
  low: number;
  mid: number;
}

/** The forecast points inside the window: today's balance, then each week's end, and the value on the window's last day read off the line between the two weeks that straddle it. */
type Outlook = Omit<PlanNotice["forecast"], "basis">;

function visiblePoints(forecast: Outlook, days: number): Point[] {
  const weeks = Math.min(forecast.p10.length, forecast.p50.length);
  if (weeks === 0) return [];
  const opening = dollars(forecast.opening);
  const all: Point[] = [{ day: 0, low: opening, mid: opening }, ...Array.from({ length: weeks }, (_, i) => ({ day: (i + 1) * WEEK, low: dollars(forecast.p10[i] ?? "0"), mid: dollars(forecast.p50[i] ?? "0") }))];
  const inside = all.filter((point) => point.day <= days);
  const after = all.find((point) => point.day > days);
  const before = inside[inside.length - 1];
  if (after && before && before.day < days) {
    const t = (days - before.day) / (after.day - before.day);
    inside.push({ day: days, low: before.low + (after.low - before.low) * t, mid: before.mid + (after.mid - before.mid) * t });
  }
  return inside;
}

export function layoutTimeline({ asOf, days, events, forecast }: { asOf: string; days: number; events: PlanNotice["events"]; forecast: Outlook }): Timeline {
  const start = dayNumber(asOf);
  const x = (day: number) => round(Math.min(100, Math.max(0, (day / days) * 100)));

  const placed: Stake[] = [];
  for (const event of events) {
    const offset = dayNumber(event.date) - start;
    if (offset < 0 || offset > days) continue;
    const at = x(offset);
    const near = placed.filter((stake) => Math.abs(stake.x - at) < SAME_SPOT).length;
    placed.push({ id: placed.length + 1, x: at, lane: Math.min(LANES - 1, near), date: event.date, kind: event.kind });
  }

  const points = visiblePoints(forecast, days);
  if (points.length < 2) return { stakes: placed, p50: "", p10: "", floorY: HEIGHT / 2, band: "", empty: true, end: null };

  const floor = dollars(forecast.floor);
  const low = Math.min(floor, ...points.map((point) => point.low));
  const high = Math.max(floor, ...points.map((point) => point.mid));
  const span = high - low || 1;
  const pad = span * 0.1;
  const y = (value: number) => round(Math.min(HEIGHT, Math.max(0, HEIGHT - ((value - (low - pad)) / (span + 2 * pad)) * HEIGHT)));
  const path = (pick: (point: Point) => number, list: Point[] = points) => list.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.day)} ${y(pick(point))}`).join(" ");
  const back = [...points].reverse().map((point) => `L${x(point.day)} ${y(point.low)}`).join(" ");
  const mid = path((point) => point.mid);
  const final = points[points.length - 1] as Point;
  const units = (value: number) => BigInt(Math.round(value * 1_000_000));
  return { stakes: placed, p50: mid, p10: path((point) => point.low), floorY: y(floor), band: `${mid} ${back} Z`, empty: false, end: { low: units(final.low), mid: units(final.mid) } };
}
