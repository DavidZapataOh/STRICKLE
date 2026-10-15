import { addDays, parsePlainDate } from "@strickle/core";
import { expect, it } from "vitest";
import { type CashEntry, forecast } from "../src/forecast.ts";
import { mulberry32, randomBelow } from "../src/prng.ts";

const U = 1_000_000n;
const asOf = parsePlainDate("2026-10-15");

function history(): CashEntry[] {
  const next = mulberry32(2026);
  const entries: CashEntry[] = [];
  for (let source = 0; source < 8; source++) {
    const count = 10 + randomBelow(next, 10);
    for (let i = 0; i < count; i++) {
      const sign = source < 5 ? 1n : -1n;
      entries.push({
        date: addDays(asOf, -randomBelow(next, 91)),
        amount: sign * BigInt(50 + randomBelow(next, 4_000)) * U,
        source: `source-${source}`,
      });
    }
  }
  return entries;
}

const BUDGET_MS = 10;

it("forecasts 200 scenarios over 13 weeks within the time budget", () => {
  const input = { asset: "USDC", asOf, openingBalance: 10_000n * U, history: history(), seed: 1 } as const;
  forecast(input);
  const runs: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    forecast(input);
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  const median = runs[10] as number;
  console.info(`forecast median ${median.toFixed(2)} ms over 20 runs, budget ${BUDGET_MS} ms`);
  expect(median).toBeLessThan(BUDGET_MS);
});
