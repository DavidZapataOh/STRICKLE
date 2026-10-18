import assert from "node:assert/strict";
import test from "node:test";
import { tractionReport } from "./traction-report.mjs";

const amounts = (total, team) => ({ total: String(total), team: String(team), organic: String(total - team) });
const metrics = {
  network: "testnet",
  asOfBlock: "67720256",
  vaults: { total: 5, team: 2, organic: 3 },
  usdcHeld: amounts(140_000_000n, 100_000_000n),
  usdcAllocated: amounts(370_000_000n, 300_000_000n),
  agentMoved: { total: amounts(1_025_000_000n, 800_000_000n), byKind: { split: amounts(370_000_000n, 300_000_000n), salary: amounts(500_000_000n, 400_000_000n), swap: amounts(99_000_000n, 99_000_000n), earn: amounts(56_000_000n, 1_000_000n) } },
  notMeasured: ["yield"],
};

test("prints the three answers the form asks for", () => {
  const text = tractionReport(metrics);
  assert.match(text, /Businesses onboarded: 5 \(3 outside the team, 2 ours\)/);
  assert.match(text, /Value the agent moved: US\$1,025\.00 \(US\$225\.00 outside the team, US\$800\.00 ours\)/);
  assert.match(text, /Income split into boxes: US\$370\.00/);
});

test("the update paragraph contains no number that is not in the data", () => {
  const text = tractionReport(metrics);
  const paragraph = text.split("\n\n").at(-1) ?? "";
  const allowed = new Set(["5", "3", "2", "1025.00", "225.00", "800.00", "370.00", "67720256", "1,025.00", "225.00", "800.00", "370.00"]);
  const found = paragraph.match(/\d[\d,]*(\.\d+)?/g) ?? [];
  assert.ok(found.length > 0);
  for (const token of found) assert.ok(allowed.has(token) || allowed.has(token.replaceAll(",", "")), `unexpected number ${token}`);
});

test("formats amounts exactly, even above 2^53, and says test USDC on testnet and USDC on mainnet", () => {
  const huge = { ...metrics, agentMoved: { ...metrics.agentMoved, total: amounts(2n ** 62n + 7n, 0n) } };
  assert.match(tractionReport(huge), /US\$4,611,686,018,427\.387911/);
  assert.match(tractionReport(metrics), /test USDC/);
  assert.doesNotMatch(tractionReport({ ...metrics, network: "mainnet" }), /test USDC/);
});

test("says plainly when the snapshot predates the agent's moves being counted, and never invents them", () => {
  const old = { ...metrics, agentMoved: undefined };
  const text = tractionReport(old);
  assert.match(text, /Value the agent moved: not measured in this snapshot/);
  assert.doesNotMatch(text, /US\$0\.00 moved/);
});
