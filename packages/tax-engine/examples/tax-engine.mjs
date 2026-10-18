import { plainDate } from "@strickle/core";
import { formatLocal, loadRules, parseLocal, reserveFor } from "@strickle/tax-engine";

const rules = loadRules(new URL("../rules", import.meta.url).pathname);
const m = parseLocal;
const reserve = reserveFor(rules, {
  country: "MX",
  today: plainDate(2026, 10, 15),
  yearToDate: m("50000"),
  lastYear: { income: m("100000"), tax: m("10000") },
  regime: { kind: "resico-monthly", input: { period: { year: 2026, month: 10 }, collected: m("100000"), yearToDate: m("100000") } },
});
console.log(`${reserve.ruleId}: set aside ${formatLocal(reserve.amount)} (${reserve.source.url})`);
if (reserve.origin !== "rule" || formatLocal(reserve.amount) !== "18000.00") throw new Error("unexpected reserve");
console.log("ok");
