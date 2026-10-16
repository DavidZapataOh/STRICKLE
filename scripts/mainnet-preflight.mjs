import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { usdcFromDollars } from "@strickle/arc/usdc";
import { privateKeyToAddress } from "viem/accounts";
import { describeDatabase } from "../packages/db/src/connect.ts";
import { agentMode } from "../apps/app/src/lib/agent-mode.ts";
import { accessMode, mintAccess } from "../apps/app/src/server/access.ts";
import { POLICY_URL, TEAM_URL, loadTeam } from "../apps/app/src/server/config-files.ts";
import { parseWavePolicy, policyDigest } from "../apps/app/src/server/wave.ts";

export const ACKNOWLEDGEMENT = "open Strickle to the first wave on Arc mainnet";
const CORE = ["BoxVault", "BoxVaultFactory"];
const AGENT = ["AgentHeartbeat", "AgentState", "AgentExecutor"];
const POOL = ["PolicyPool"];
export const ALWAYS = ["gas-station-policy", "entity-secret-mainnet", "vercel-environment", "passkey-domain-and-client-key", "postgres-provisioned", "first-wave-list", "limits-confirmed", "team-list-confirmed"];

export const APPROVAL_IDS = [...ALWAYS, "deploy-core", "tax-rules-accepted"];

const withPrefix = (key) => (key.startsWith("0x") ? key : `0x${key}`);
const pass = (id, detail) => ({ id, status: "pass", detail });
const fail = (id, detail) => ({ id, status: "fail", detail });
const manual = (id, detail) => ({ id, status: "manual", detail });

const valid = (entry) => Boolean(entry) && /^\d{4}-\d{2}-\d{2}$/.test(entry.approvedOn ?? "") && typeof entry.ownerQuote === "string" && entry.ownerQuote.trim().length >= 4;

export async function runPreflight({ network = "mainnet", phase = "before-deploy", env, approvals, world }) {
  const results = [];
  const attempt = async (id, check) => {
    try {
      results.push(await check());
    } catch (error) {
      results.push(fail(id, error instanceof Error ? error.message : String(error)));
    }
  };
  const approved = (id) => valid(approvals[id]);
  const deployed = phase !== "before-deploy";

  await attempt("rpc", async () => {
    const probe = await world.probe(network);
    return pass("rpc", `chain ${probe.chainId}, block ${probe.blockNumber}`);
  });

  await attempt("deployer-key", async () => {
    if (!env.MAINNET_PRIVATE_KEY) return fail("deployer-key", "MAINNET_PRIVATE_KEY is not set");
    const address = privateKeyToAddress(withPrefix(env.MAINNET_PRIVATE_KEY));
    if (env.PRIVATE_KEY && privateKeyToAddress(withPrefix(env.PRIVATE_KEY)) === address) return fail("deployer-key", "the mainnet key is the testnet key");
    return pass("deployer-key", `deployer ${address.slice(0, 10)}…`);
  });

  await attempt("deployer-balance", async () => {
    const needed = usdcFromDollars(env.MAINNET_MIN_DEPLOYER_USDC ?? "", "MAINNET_MIN_DEPLOYER_USDC");
    const held = await world.balanceOf(privateKeyToAddress(withPrefix(env.MAINNET_PRIVATE_KEY ?? "")));
    return held >= needed ? pass("deployer-balance", "above the owner's minimum") : fail("deployer-balance", "below the owner's minimum");
  });

  const circle = ["CIRCLE_API_KEY_MAINNET", "CIRCLE_ENTITY_SECRET_MAINNET", "CIRCLE_GAS_STATION_SCA_WALLET_ID_MAINNET", "CIRCLE_GAS_STATION_EOA_WALLET_ID_MAINNET"].filter((name) => !env[name]);
  results.push(circle.length === 0 ? pass("circle-mainnet", "the four mainnet Circle variables are set") : fail("circle-mainnet", `missing: ${circle.join(", ")}`));

  await attempt("database", async () => {
    if (!env.DATABASE_URL) return fail("database", "DATABASE_URL is not set");
    const target = describeDatabase(env.DATABASE_URL);
    if (target.local) return fail("database", "DATABASE_URL points at a local database");
    if (!target.pooled) return fail("database", "DATABASE_URL must be the pooled connection string (its host carries -pooler): serverless instances would exhaust the direct one");
    const pending = await world.pending(env.DATABASE_URL);
    return pending.length === 0 ? pass("database", `reachable, ${world.migrationFiles().length} migrations applied`) : fail("database", `not applied: ${pending.join(", ")}`);
  });

  await attempt("limits", async () => {
    const text = world.policyText();
    parseWavePolicy(JSON.parse(text));
    const digest = policyDigest(text);
    const entry = approvals["limits-confirmed"];
    if (!valid(entry)) return manual("limits", `the owner has not confirmed these limits: record limits-confirmed with --value=${digest}`);
    return entry.value === digest ? pass("limits", "the policy file is the one the owner confirmed") : fail("limits", `the policy file changed since the owner confirmed it: confirm again with --value=${digest}`);
  });

  await attempt("team", async () => {
    const team = world.team();
    if (team.length === 0) return fail("team", "the team list is empty: the public metrics could not tell the team from everyone else");
    return approved("team-list-confirmed") ? pass("team", `${team.length} addresses, confirmed by the owner`) : manual("team", "the owner has not confirmed the team list (team-list-confirmed)");
  });

  await attempt("access", async () => {
    const mode = accessMode({ NEXT_PUBLIC_APP_NETWORK: "mainnet", ACCESS_MODE: env.ACCESS_MODE });
    if (mode === "open") return fail("access", "ACCESS_MODE must be invite or closed on mainnet");
    mintAccess(env.ACCESS_COOKIE_SECRET ?? "", randomUUID(), Date.now() + 1000);
    return pass("access", `mode ${mode}`);
  });

  await attempt("relay-pepper", async () => ((env.RELAY_IP_PEPPER ?? "").length >= 32 ? pass("relay-pepper", "set") : fail("relay-pepper", "RELAY_IP_PEPPER must be at least 32 characters")));

  await attempt("agent", async () => {
    const mode = world.agentMode(network);
    return mode === "none" ? fail("agent", "no agent can run on mainnet: Chainlink CRE does not list Arc mainnet, so opening to users waits for it") : pass("agent", `agent mode ${mode}`);
  });

  await attempt("tax-rules", async () => {
    const countries = (env.EARLY_ACCESS_COUNTRIES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    if (countries.length === 0) return fail("tax-rules", "EARLY_ACCESS_COUNTRIES is not set");
    const unverified = world.rules().filter((rule) => countries.includes(rule.country) && !rule.verified);
    if (unverified.length === 0) return pass("tax-rules", "every rule of the first wave is verified");
    return approved("tax-rules-accepted") ? pass("tax-rules", "unverified rules accepted by the owner") : manual("tax-rules", `unverified: ${unverified.map((rule) => rule.id).join(", ")}`);
  });

  const present = (names) => names.filter((name) => world.manifest(network).contracts[name]);

  await attempt("contracts", async () => {
    if (!deployed) {
      const already = present([...CORE, ...AGENT, ...POOL]);
      return already.length === 0 ? pass("contracts", "nothing deployed yet") : fail("contracts", `already in the manifest: ${already.join(", ")}`);
    }
    if (present(CORE).length !== CORE.length) return fail("contracts", "the core contracts are not in the manifest");
    const agents = present(AGENT);
    return agents.length === 0 ? pass("contracts", "core contracts only") : fail("contracts", `agent contracts on mainnet: ${agents.join(", ")}`);
  });

  await attempt("pool", async () => (present(POOL).length === 0 ? pass("pool", "the private pool is not on mainnet: it stays off until an audit exists") : fail("pool", "PolicyPool is in the mainnet manifest: the private pool stays off until an audit exists")));

  const required = [...ALWAYS, ...(deployed ? ["deploy-core"] : [])];
  const missing = required.filter((id) => !approved(id));
  results.push(missing.length === 0 ? pass("approvals", "every owner approval is recorded with the owner's words") : manual("approvals", `missing or without date and quote: ${missing.join(", ")}`));

  if (phase === "final") {
    const typed = world.acknowledgement();
    if (typed === undefined) results.push(manual("owner-acknowledgement", `the owner must type: ${ACKNOWLEDGEMENT}`));
    else results.push(typed.trim() === ACKNOWLEDGEMENT ? pass("owner-acknowledgement", "typed by the owner in this run") : fail("owner-acknowledgement", "the typed text does not match"));
  }

  return { results, ok: results.every((result) => result.status === "pass") };
}

if (import.meta.main) {
  const [network = "mainnet", phase = "before-deploy"] = process.argv.slice(2);
  const [{ probeNetwork, usdcBalance }, { loadRules }, { connect, pendingMigrations }] = await Promise.all([import("@strickle/arc/probe"), import("@strickle/tax-engine"), import("@strickle/db")]);
  const approvalsFile = process.env.MAINNET_APPROVALS_FILE ?? "/Users/david/tameion/mainnet-approvals.json";
  let approvals = {};
  try {
    approvals = JSON.parse(readFileSync(approvalsFile, "utf8"));
  } catch {
    // no approvals recorded yet: every manual check stays red
  }
  const migrations = new URL("../packages/db/migrations/", import.meta.url);
  let typed;
  if (phase === "final") {
    if (!process.stdin.isTTY) throw new Error("the final run needs a terminal: the owner types the acknowledgement");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    typed = await rl.question(`Type "${ACKNOWLEDGEMENT}" to confirm: `);
    rl.close();
  }
  const report = await runPreflight({
    network,
    phase,
    env: process.env,
    approvals,
    world: {
      probe: (name) => probeNetwork(name),
      balanceOf: (address) => usdcBalance(network, address),
      pending: async (url) => {
        const sql = connect(url, { max: 1 });
        try {
          return await pendingMigrations(sql);
        } finally {
          await sql.end();
        }
      },
      migrationFiles: () => readdirSync(migrations).filter((name) => name.endsWith(".sql")),
      rules: () => loadRules(new URL("../packages/tax-engine/rules", import.meta.url).pathname).map((rule) => ({ id: rule.id, country: rule.country, verified: rule.verification.status === "verified" })),
      manifest: (name) => JSON.parse(readFileSync(new URL(`../contracts/deployments/arc-${name}.json`, import.meta.url), "utf8")),
      policyText: () => readFileSync(POLICY_URL, "utf8"),
      team: () => loadTeam(TEAM_URL),
      agentMode: (name) => agentMode(name),
      acknowledgement: () => typed,
    },
  });
  for (const result of report.results) console.log(`${result.status.toUpperCase().padEnd(6)} ${result.id.padEnd(22)} ${result.detail}`);
  process.exit(report.ok ? 0 : 1);
}
