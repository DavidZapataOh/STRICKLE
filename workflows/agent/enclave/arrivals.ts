import { type Arrival, type Expectation, type Part, type Sent, classifyArrival } from "@strickle/brain";
import { type PlainDate, daysBetween, formatPlainDate, parsePlainDate } from "@strickle/core";
import { keccak256, toBytes } from "viem";
import { BOX_KINDS } from "@strickle/core";
import { BOX_ID, type VaultBooks, allocateAmount } from "./cascade.ts";
import type { Notice } from "./notice-schema.ts";
import type { Profile } from "./profile.ts";

const WINDOW_DAYS = 91;
const MAX_HISTORY = 200;
const MAX_ARRIVALS = 40;
const BPS = 10_000n;

export interface ArrivalPlan {
  boxes: number[];
  amounts: bigint[];
  next: Profile;
  notices: Notice[];
}

const CLASS_CODE = { income: "i", "own-transfer": "o", refund: "r" } as const;
const HISTORY_SOURCE = { income: "deposit", "own-transfer": "transfer", refund: "refund" } as const;
const ASSET_CODE = { USDC: "U", EURC: "E" } as const;
const ASSET_OF = { U: "USDC", E: "EURC" } as const;

const unexplainedId = (checkpoint: bigint): string => keccak256(toBytes(`unexplained:${checkpoint}`)).slice(2, 12);
const ceilMul = (amount: bigint, rate: number, buffer: number): bigint => (amount * BigInt(rate) * BigInt(buffer) + BPS * BPS - 1n) / (BPS * BPS);

/**
 * The deposit handler's heart: each arrival is classified, each part goes through the cascade on the running books (taxes only for income, plus any catch-up owed), and one merged split comes out with the books written back. What no log explains is income with a notice.
 */
export function planArrivals(input: { profile: Profile; books: VaultBooks; arrivals: Arrival[]; unexplained: bigint; checkpoint: bigint; today: PlainDate; now: number }): ArrivalPlan {
  const { profile, books, today, now } = input;
  const recent = profile.history.filter(([date]) => daysBetween(parsePlainDate(date), today) < WINDOW_DAYS);
  const recentMax = recent.filter(([, , source]) => source === "deposit").reduce((max, [, amount]) => (BigInt(amount) > max ? BigInt(amount) : max), 0n);

  let expectations: Expectation[] = profile.flow.expect.map((entry) => ({ id: entry.id, asset: entry.asset, min: BigInt(entry.min), max: BigInt(entry.max), expiresAt: entry.expiresAt }));
  let sent: Sent[] = profile.flow.sent.map(([to, asset, amount, date, kind]) => ({ to, asset: ASSET_OF[asset], amount: BigInt(amount), date: parsePlainDate(date), kind: kind === "o" ? "own" : "payee" }));

  const running = { operating: books.operating, payrollFunded: books.payrollFunded, emergency: books.emergency };
  let salaryOwed = profile.salaryOwed;
  let catchUp = BigInt(profile.taxCatchUp);
  const perBox = new Map<number, bigint>();
  const history: [string, string, string][] = [];
  const ledger: Profile["arrivals"] = [];
  const notices: Notice[] = [];

  const apply = (id: string, asset: Arrival["asset"], part: Part, index: number) => {
    const income = part.class === "income";
    const extra = income ? (catchUp < part.amount ? catchUp : part.amount) : 0n;
    const result = allocateAmount({ ...profile, salaryOwed }, { ...books, ...running, unallocated: part.amount }, part.amount, { income, taxExtra: extra });
    for (const kind of BOX_KINDS) {
      const units = result.byBox[kind].units;
      if (units > 0n) perBox.set(BOX_ID[kind], (perBox.get(BOX_ID[kind]) ?? 0n) + units);
    }
    running.operating += result.byBox.operating.units;
    running.payrollFunded += result.byBox.payroll.units;
    running.emergency += result.byBox.emergency.units;
    salaryOwed = result.salaryPending.units.toString();
    if (income && extra > 0n) {
      const beyondOwn = result.byBox.taxes.units - ceilMul(part.amount, profile.taxRateBps, profile.taxBufferBps);
      const taken = beyondOwn > 0n ? (beyondOwn < extra ? beyondOwn : extra) : 0n;
      catchUp -= taken;
    }
    history.push([formatPlainDate(today), part.amount.toString(), HISTORY_SOURCE[part.class]]);
    ledger.push([`${id}-${index}`, formatPlainDate(today), part.amount.toString(), CLASS_CODE[part.class], ASSET_CODE[asset]]);
  };

  for (const arrival of input.arrivals) {
    const classified = classifyArrival(arrival, { now, owners: profile.flow.owners, expectations, sent, recentMax });
    expectations = classified.expectations;
    sent = classified.sent;
    let noticed = false;
    classified.parts.forEach((part, index) => {
      apply(arrival.id, arrival.asset, part, index);
      if (part.class === "income" && part.flags.length > 0 && !noticed) {
        noticed = true;
        notices.push({ kind: "income-doubt", arrivalId: `${arrival.id}-${index}`, asset: arrival.asset, amount: part.amount.toString(), flags: part.flags, sender: part.flags.includes("own-address") && arrival.sender !== null ? arrival.sender : "" });
      }
    });
  }

  if (input.unexplained > 0n) {
    const id = unexplainedId(input.checkpoint);
    apply(id, books.asset, { amount: input.unexplained, class: "income", basis: "default", flags: ["unattributed"] }, 0);
    notices.push({ kind: "income-doubt", arrivalId: `${id}-0`, asset: books.asset, amount: input.unexplained.toString(), flags: ["unattributed"], sender: "" });
  }

  const boxes = BOX_KINDS.map((kind) => BOX_ID[kind]).filter((box) => (perBox.get(box) ?? 0n) > 0n);
  return {
    boxes,
    amounts: boxes.map((box) => perBox.get(box) as bigint),
    notices,
    next: {
      ...profile,
      history: [...recent, ...history].slice(-MAX_HISTORY),
      salaryOwed,
      taxCatchUp: catchUp.toString(),
      arrivals: [...profile.arrivals, ...ledger].slice(-MAX_ARRIVALS),
      flow: {
        checkpoint: input.checkpoint.toString(),
        owners: profile.flow.owners,
        expect: expectations.map((e) => ({ id: e.id, asset: e.asset, min: e.min.toString(), max: e.max.toString(), expiresAt: e.expiresAt })),
        sent: sent.map((entry) => [entry.to, ASSET_CODE[entry.asset], entry.amount.toString(), formatPlainDate(entry.date), entry.kind === "own" ? "o" : "p"] as Profile["flow"]["sent"][number]),
      },
    },
  };
}
