import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { recordApproval } from "./record-approval.mjs";

const file = () => join(mkdtempSync(join(tmpdir(), "approvals-")), "approvals.json");
const now = new Date("2026-10-20T15:00:00Z");

test("records the date, the owner's words and the value, and keeps what was there", () => {
  const path = file();
  recordApproval({ file: path, id: "gas-station-policy", quote: "yes, activate it at 5 dollars a day", now });
  recordApproval({ file: path, id: "limits-confirmed", value: "ab12", quote: "these limits are right", now });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
    "gas-station-policy": { approvedOn: "2026-10-20", ownerQuote: "yes, activate it at 5 dollars a day" },
    "limits-confirmed": { approvedOn: "2026-10-20", ownerQuote: "these limits are right", value: "ab12" },
  });
});

test("refuses an unknown id, a thin quote and a silent overwrite", () => {
  const path = file();
  assert.throws(() => recordApproval({ file: path, id: "made-up", quote: "yes please", now }), /unknown approval/);
  assert.throws(() => recordApproval({ file: path, id: "first-wave-list", quote: "ok", now }), /quote/);
  assert.throws(() => recordApproval({ file: path, id: "first-wave-list", quote: "   ", now }), /quote/);
  recordApproval({ file: path, id: "first-wave-list", quote: "twenty freelancers from the list", now });
  assert.throws(() => recordApproval({ file: path, id: "first-wave-list", quote: "twenty-five now", now }), /already recorded/);
  recordApproval({ file: path, id: "first-wave-list", quote: "twenty-five now", now, replace: true });
  assert.equal(JSON.parse(readFileSync(path, "utf8"))["first-wave-list"].ownerQuote, "twenty-five now");
});

test("a corrupt file is never overwritten", () => {
  const path = file();
  writeFileSync(path, "{ not json");
  assert.throws(() => recordApproval({ file: path, id: "gas-station-policy", quote: "yes, activate it", now }));
  assert.equal(readFileSync(path, "utf8"), "{ not json");
});
