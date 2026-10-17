# @strickle/tax-engine

Versioned tax rules for freelancers who get paid from abroad, each with its public source, and the arithmetic that turns an income into the amount to set aside and the dates it is due.

## What it does

- Loads rule files (`rules/<country>/*.json`) and refuses a set whose rules have expired.
- Computes the reserve for a payment: `reserveFor(rules, request)` returns the amount, the rule that produced it, the source URL and the verification status of that rule. Where no rule applies it falls back to a stated effective rate and says so (`origin: "fallback"`).
- Regimes: Mexico RESICO (ISR and VAT), Argentina monotributo, Colombia SIMPLE, Brazil MEI, United States estimated-tax safe harbor, Philippines 8% option, Pakistan export of services, and the export-services rules of Brazil and Mexico.
- Next due dates (`dueDates`), national holiday calendars (`calendars/`), withholdings and foreign-exchange sources (`fx/sources.json`).
- All money is a `bigint` in minor units; nothing is rounded through a floating-point number.

## Install

```sh
npm install ./strickle-core-0.1.0.tgz ./strickle-tax-engine-0.1.0.tgz
```

The tarballs come from `npm run kits:pack -- @strickle/tax-engine` in the repository. Node 24 or newer.

## Example

The file `examples/tax-engine.mjs` is this code:

```js
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
```

## What it does not do

- It does not file or pay anything and it is not tax advice. A rule marked `unverified` has not been checked by a named person; the verification status travels with every result so an interface can show it.
- It does not cover every country. An uncovered country gets the fallback rate, labelled as such.
- It does not fetch live rates. Foreign-exchange conversion takes a rate the caller supplies, and `fx/sources.json` lists where each rate comes from.

## Tested on

The unit tests in `tests/` run the arithmetic of each regime against worked examples taken from the rule's source. `npm run test:live -w @strickle/tax-engine` checks the foreign-exchange sources against the real services they name.
