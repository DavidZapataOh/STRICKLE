import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POLICY_URL } from "../apps/app/src/server/config-files.ts";
import { policyDigest } from "../apps/app/src/server/wave.ts";
import { ACKNOWLEDGEMENT, runPreflight } from "./mainnet-preflight.mjs";

const TESTNET_KEY = `0x${"11".repeat(32)}`;
const MAINNET_KEY = `0x${"22".repeat(32)}`;
const goodEnv = {
  PRIVATE_KEY: TESTNET_KEY,
  MAINNET_PRIVATE_KEY: MAINNET_KEY,
  CIRCLE_API_KEY_MAINNET: "k",
  CIRCLE_ENTITY_SECRET_MAINNET: "s",
  CIRCLE_GAS_STATION_SCA_WALLET_ID_MAINNET: "a",
  CIRCLE_GAS_STATION_EOA_WALLET_ID_MAINNET: "b",
  DATABASE_URL: "postgres://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb",
  ACCESS_MODE: "invite",
  ACCESS_COOKIE_SECRET: "c".repeat(40),
  RELAY_IP_PEPPER: "p".repeat(32),
  NEXT_PUBLIC_APP_NETWORK: "mainnet",
  MAINNET_MIN_DEPLOYER_USDC: "5",
  EARLY_ACCESS_COUNTRIES: "CO",
};
const policyText = readFileSync(POLICY_URL, "utf8");
const approval = (extra = {}) => ({ approvedOn: "2026-10-20", ownerQuote: "yes, go", ...extra });
const ids = ["gas-station-policy", "entity-secret-mainnet", "vercel-environment", "passkey-domain-and-client-key", "postgres-provisioned", "first-wave-list", "team-list-confirmed", "tax-rules-accepted", "deploy-core"];
const allApprovals = { ...Object.fromEntries(ids.map((id) => [id, approval()])), "limits-confirmed": approval({ value: policyDigest(policyText) }) };
const core = { contracts: { BoxVault: { address: "0x1" }, BoxVaultFactory: { address: "0x2" } } };

// Every dependency that touches the outside world is injected: the test asserts the decision logic, not the world.
// `agentMode` answers "cre-testnet" here as the stand-in for "an agent exists": the real answer for mainnet is tested on its own below.
const world = {
  probe: async () => ({ network: "mainnet", chainId: 5042, blockNumber: 1n, usdcCodeBytes: 10, eurcCodeBytes: 10 }),
  balanceOf: async () => 10_000_000n,
  pending: async () => [],
  migrationFiles: () => ["0001_init.sql"],
  rules: () => [{ id: "co-simple-professional", country: "CO", verified: false }],
  manifest: () => ({ contracts: {} }),
  policyText: () => policyText,
  team: () => ["0x00000000000000000000000000000000000000a1"],
  agentMode: () => "cre-testnet",
  acknowledgement: () => undefined,
};
const run = ({ phase = "before-deploy", env = goodEnv, approvals = allApprovals, overrides = {} } = {}) => runPreflight({ network: "mainnet", phase, env, approvals, world: { ...world, ...overrides } });
const deployed = { manifest: () => core };
const byId = (report, id) => report.results.find((result) => result.id === id);
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

test("everything in place passes before the deploy, and the report names every check", async () => {
  const report = await run({ approvals: without(allApprovals, "deploy-core") });
  assert.equal(report.ok, true, JSON.stringify(report.results.filter((r) => r.status !== "pass")));
  assert.deepEqual(report.results.map((r) => r.id).sort(), ["access", "agent", "approvals", "circle-mainnet", "contracts", "database", "deployer-balance", "deployer-key", "limits", "pool", "relay-pepper", "rpc", "tax-rules", "team"]);
});

test("on mainnet there is no agent, so the preflight stays red and says why", async () => {
  const { agentMode } = await import("../apps/app/src/lib/agent-mode.ts");
  const report = await run({ overrides: { agentMode } });
  assert.equal(byId(report, "agent").status, "fail");
  assert.match(byId(report, "agent").detail, /CRE does not list Arc mainnet/);
  assert.equal(report.ok, false);
});

test("the testnet key reused as the mainnet key fails, and so does a missing one", async () => {
  assert.equal(byId(await run({ env: { ...goodEnv, MAINNET_PRIVATE_KEY: TESTNET_KEY } }), "deployer-key").status, "fail");
  assert.equal(byId(await run({ env: { ...goodEnv, MAINNET_PRIVATE_KEY: undefined } }), "deployer-key").status, "fail");
});

test("the balance is compared in USDC base units: the same number of 18-decimal units can never pass", async () => {
  assert.equal(byId(await run({ overrides: { balanceOf: async () => 4_999_999n } }), "deployer-balance").status, "fail");
  assert.equal(byId(await run({ overrides: { balanceOf: async () => 5_000_000n } }), "deployer-balance").status, "pass");
  assert.equal(byId(await run({ env: { ...goodEnv, MAINNET_MIN_DEPLOYER_USDC: undefined } }), "deployer-balance").status, "fail");
});

test("the limits are the committed policy and the owner's confirmation of exactly that policy", async () => {
  assert.equal(byId(await run(), "limits").status, "pass");
  assert.equal(byId(await run({ approvals: without(allApprovals, "limits-confirmed") }), "limits").status, "manual");
  assert.match(byId(await run({ approvals: without(allApprovals, "limits-confirmed") }), "limits").detail, new RegExp(policyDigest(policyText)));
  const changed = policyText.replaceAll('"500"', '"600"');
  const stale = await run({ overrides: { policyText: () => changed } });
  assert.equal(byId(stale, "limits").status, "fail");
  assert.match(byId(stale, "limits").detail, /changed since the owner confirmed/);
  assert.equal(byId(await run({ overrides: { policyText: () => "{ not json" } }), "limits").status, "fail");
  assert.equal(byId(await run({ overrides: { policyText: () => JSON.stringify({ totalUsd: "5" }) } }), "limits").status, "fail");
});

test("the team list must exist and be confirmed", async () => {
  assert.equal(byId(await run({ overrides: { team: () => [] } }), "team").status, "fail");
  assert.equal(byId(await run({ approvals: without(allApprovals, "team-list-confirmed") }), "team").status, "manual");
  assert.equal(byId(await run(), "team").status, "pass");
});

test("an open app on mainnet fails; an explicit mode and a real cookie secret pass; the relay needs its pepper", async () => {
  assert.equal(byId(await run({ env: { ...goodEnv, ACCESS_MODE: "open" } }), "access").status, "fail");
  assert.equal(byId(await run({ env: { ...goodEnv, ACCESS_MODE: undefined } }), "access").status, "fail");
  assert.equal(byId(await run({ env: { ...goodEnv, ACCESS_COOKIE_SECRET: "short" } }), "access").status, "fail");
  assert.equal(byId(await run({ env: { ...goodEnv, RELAY_IP_PEPPER: "short" } }), "relay-pepper").status, "fail");
});

test("unverified tax rules block the first wave's countries unless the owner accepted them", async () => {
  const blocked = await run({ approvals: without(allApprovals, "tax-rules-accepted") });
  assert.equal(byId(blocked, "tax-rules").status, "manual");
  assert.match(byId(blocked, "tax-rules").detail, /co-simple-professional/);
  const verified = await run({ approvals: without(allApprovals, "tax-rules-accepted"), overrides: { rules: () => [{ id: "co-simple-professional", country: "CO", verified: true }] } });
  assert.equal(byId(verified, "tax-rules").status, "pass");
  assert.equal(byId(await run({ env: { ...goodEnv, EARLY_ACCESS_COUNTRIES: "" } }), "tax-rules").status, "fail");
});

test("what a machine cannot check stays red until an approval with the owner's words exists", async () => {
  for (const id of ids.filter((name) => name !== "deploy-core" && name !== "tax-rules-accepted")) {
    const report = await run({ approvals: without(allApprovals, id) });
    assert.equal(report.ok, false, `${id} must block`);
    assert.match(byId(report, "approvals").detail, new RegExp(id));
  }
});

test("an approval without a date or without the owner's quote does not count", async () => {
  for (const bad of [{ approvedOn: "2026-10-20" }, { ownerQuote: "yes" }, { approvedOn: "2026-10-20", ownerQuote: "   " }, { approvedOn: "soon", ownerQuote: "yes" }, {}]) {
    const report = await run({ approvals: { ...allApprovals, "gas-station-policy": bad } });
    assert.equal(byId(report, "approvals").status, "manual");
    assert.match(byId(report, "approvals").detail, /gas-station-policy/);
  }
});

test("a database that is unreachable, local, direct instead of pooled, or behind on migrations fails", async () => {
  assert.equal(byId(await run({ overrides: { pending: async () => { throw new Error("connection refused"); } } }), "database").status, "fail");
  assert.equal(byId(await run({ overrides: { pending: async () => ["0005_wave_events.sql"] } }), "database").status, "fail");
  assert.equal(byId(await run({ env: { ...goodEnv, DATABASE_URL: "postgres://u:p@localhost/x" } }), "database").status, "fail");
  assert.equal(byId(await run({ env: { ...goodEnv, DATABASE_URL: "postgres://u:p@ep-x.us-east-1.aws.neon.tech/neondb" } }), "database").status, "fail");
  assert.equal(byId(await run({ env: { ...goodEnv, DATABASE_URL: undefined } }), "database").status, "fail");
});

test("before the deploy the manifest holds nothing; after it, the core contracts and no agent", async () => {
  assert.equal(byId(await run({ overrides: deployed }), "contracts").status, "fail");
  assert.equal(byId(await run({ phase: "after-deploy", overrides: deployed }), "contracts").status, "pass");
  assert.equal(byId(await run({ phase: "after-deploy" }), "contracts").status, "fail");
  const withAgent = { manifest: () => ({ contracts: { ...core.contracts, AgentExecutor: { address: "0x3" } } }) };
  assert.equal(byId(await run({ phase: "after-deploy", overrides: withAgent }), "contracts").status, "fail");
});

test("the private pool is never on mainnet", async () => {
  assert.equal(byId(await run(), "pool").status, "pass");
  const pool = { manifest: () => ({ contracts: { ...core.contracts, PolicyPool: { address: "0x4" } } }) };
  assert.equal(byId(await run({ phase: "after-deploy", overrides: pool }), "pool").status, "fail");
});

test("the final run is green only when the owner typed the acknowledgement during it", async () => {
  const final = (typed) => run({ phase: "final", overrides: { ...deployed, acknowledgement: () => typed } });
  assert.equal(byId(await final(undefined), "owner-acknowledgement").status, "manual");
  assert.equal(byId(await final("yes"), "owner-acknowledgement").status, "fail");
  const ok = await final(ACKNOWLEDGEMENT);
  assert.equal(byId(ok, "owner-acknowledgement").status, "pass");
  assert.equal(ok.ok, true, JSON.stringify(ok.results.filter((r) => r.status !== "pass")));
});

test("an RPC that is not the network fails the whole run", async () => {
  const report = await run({ overrides: { probe: async () => { throw new Error("chain id mismatch on mainnet"); } } });
  assert.equal(byId(report, "rpc").status, "fail");
  assert.equal(report.ok, false);
});
