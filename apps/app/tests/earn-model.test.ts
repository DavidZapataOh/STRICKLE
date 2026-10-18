import { readFileSync } from "node:fs";
import { decodeFunctionData, parseAbi, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { EARN_VAULTS } from "../src/config/earn.ts";
import { earnSetupCalls } from "../src/yield/calls.ts";
import { earnAction } from "../src/yield/actions.ts";
import { earnStatus } from "../src/yield/status.ts";
import { parseVaults } from "../src/yield/vaults.ts";

const EARN = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88" as const;
const ADAPTER = "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b" as const;
const VAULT = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8" as const;
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("the vaults the app offers", () => {
  it("are the ones the agent is configured for, so the two cannot drift apart", () => {
    const agent = json("../../../workflows/agent/config.staging.json").earn.vaults;
    expect(EARN_VAULTS.testnet.map((entry) => [entry.address.toLowerCase(), entry.name, entry.protocol])).toEqual(agent.map((entry: { address: string; name: string; protocol: string }) => [entry.address.toLowerCase(), entry.name, entry.protocol]));
    expect(json("../../../workflows/agent/config.production.json").earn).toEqual(json("../../../workflows/agent/config.staging.json").earn);
  });
});

describe("Circle's list of vaults", () => {
  it("keeps only the configured vault and reads its yield in basis points", () => {
    const vaults = parseVaults(json("./fixtures/earn-vaults.json"), EARN_VAULTS.testnet);
    expect(vaults).toEqual([{ address: EARN, name: "EarnKit USDC Vault", protocol: "Morpho", apyBps: 420, asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }]);
  });

  it("matches addresses whatever the letter case and survives answers it cannot read", () => {
    expect(parseVaults(json("./fixtures/earn-vaults.json"), [{ address: EARN.toLowerCase() as `0x${string}`, name: "x", protocol: "y" }])).toHaveLength(1);
    for (const bad of [null, {}, { data: {} }, { data: { vaults: "no" } }, { data: { vaults: [{ vaultAddress: EARN, currentApy: "high" }] } }]) {
      expect(parseVaults(bad, EARN_VAULTS.testnet)).toEqual([]);
    }
  });
});

describe("the signed request to put money to work or take it back", () => {
  const base = { kind: "invest" as const, box: "profit", vault: EARN, dollars: "250" };

  it("turns dollars into base units for an invest and a divest", () => {
    expect(earnAction(base)).toEqual({ ok: true, action: { kind: "invest", box: "profit", vault: EARN, amount: "250000000" } });
    expect(earnAction({ ...base, kind: "divest", dollars: "12.5" })).toEqual({ ok: true, action: { kind: "divest", box: "profit", vault: EARN, amount: "12500000" } });
    expect(earnAction({ ...base, dollars: "0.000001" })).toMatchObject({ ok: true, action: { amount: "1" } });
  });

  it("refuses a zero, a negative or malformed amount, the salary box and a vault that is not offered", () => {
    for (const dollars of ["0", "0.0", "-5", "1,5", "abc", "", "1.1234567", "1e6"]) expect(earnAction({ ...base, dollars })).toEqual({ ok: false, error: "amount" });
    expect(earnAction({ ...base, box: "salary" })).toEqual({ ok: false, error: "box" });
    expect(earnAction({ ...base, vault: "0x00000000000000000000000000000000000000d9" })).toEqual({ ok: false, error: "vault" });
  });
});

describe("what the account can do about yield", () => {
  const live = { supported: true as const, vaults: [{ vault: EARN, approvedFrom: 1_000, shares: {}, value: {} }], maxInvestBps: { taxes: 5_000, payroll: 0, operating: 0, emergency: 10_000, profit: 10_000 }, invested: {} };
  const conversions = { supported: true as const, adapter: ADAPTER, from: 1_000, cap: 5n, window: 86_400 };
  const status = (over: Record<string, unknown> = {}) => earnStatus({ earn: live, conversions, expectedAdapter: ADAPTER, vault: EARN, now: 2_000, ...over } as never);

  it("is ready when the adapter and the vault are both approved and in force", () => {
    expect(status()).toEqual({ kind: "active" });
  });

  it("waits, with the date, until the later of the two approvals is in force", () => {
    expect(status({ now: 500 })).toEqual({ kind: "pending", from: 1_000 });
    expect(status({ earn: { ...live, vaults: [{ ...live.vaults[0], approvedFrom: 3_000 }] } })).toEqual({ kind: "pending", from: 3_000 });
  });

  it("needs the owner's approval when a vault or the adapter was never approved", () => {
    expect(status({ earn: { ...live, vaults: [{ ...live.vaults[0], approvedFrom: 0 }] } })).toEqual({ kind: "not-allowed", needs: ["vault"] });
    expect(status({ conversions: { ...conversions, adapter: zeroAddress, from: 0 } })).toEqual({ kind: "not-allowed", needs: ["adapter"] });
    expect(status({ conversions: { ...conversions, adapter: zeroAddress, from: 0 }, earn: { ...live, vaults: [{ ...live.vaults[0], approvedFrom: 0 }] } })).toEqual({ kind: "not-allowed", needs: ["adapter", "vault"] });
  });

  it("is unavailable on an account from before yield existed, and when another adapter is set", () => {
    expect(status({ earn: { supported: false, reason: "old" } })).toEqual({ kind: "unavailable" });
    expect(status({ earn: undefined })).toEqual({ kind: "unavailable" });
    expect(status({ conversions: { ...conversions, adapter: EARN } })).toEqual({ kind: "unavailable" });
  });

  it("says it could not read, rather than that the account is old, when the read failed", () => {
    expect(status({ earn: { supported: false, reason: "unreadable" } })).toEqual({ kind: "unreadable" });
  });

  it("is unavailable for a vault the account has no row for", () => {
    expect(status({ vault: "0x00000000000000000000000000000000000000d9" })).toEqual({ kind: "unavailable" });
  });
});

describe("the owner's calls that allow yield", () => {
  const abi = parseAbi(["function approveVault(address vault)", "function approveSwapAdapter(address adapter)"]);
  const decode = (call: { data: `0x${string}` }) => decodeFunctionData({ abi, data: call.data });

  it("approve the vault, and the adapter first when it was never approved", () => {
    const both = earnSetupCalls({ vault: VAULT, adapter: ADAPTER, earnVault: EARN, needs: ["adapter", "vault"] });
    expect(both.map((call) => call.to)).toEqual([VAULT, VAULT]);
    expect(both.map((call) => decode(call))).toEqual([{ functionName: "approveSwapAdapter", args: [ADAPTER] }, { functionName: "approveVault", args: [EARN] }]);
    expect(earnSetupCalls({ vault: VAULT, adapter: ADAPTER, earnVault: EARN, needs: ["vault"] }).map((call) => decode(call).functionName)).toEqual(["approveVault"]);
  });
});

describe("how much a box may still put to work", async () => {
  const { investRoom } = await import("../src/yield/room.ts");

  it("is the box's share of everything it holds, less what already works", () => {
    expect(investRoom({ cash: 1_000_000_000n, working: 0n, maxBps: 5_000 })).toBe(500_000_000n);
    expect(investRoom({ cash: 500_000_000n, working: 500_000_000n, maxBps: 5_000 })).toBe(0n);
    expect(investRoom({ cash: 600_000_000n, working: 400_000_000n, maxBps: 5_000 })).toBe(100_000_000n);
  });

  it("is never more than the cash, nor below zero, and zero where no share is allowed", () => {
    expect(investRoom({ cash: 10n, working: 0n, maxBps: 10_000 })).toBe(10n);
    expect(investRoom({ cash: 100n, working: 900n, maxBps: 5_000 })).toBe(0n);
    expect(investRoom({ cash: 5_000_000_000n, working: 0n, maxBps: 0 })).toBe(0n);
  });
});


describe("the yield switch", async () => {
  const { yieldChange, settingsMatch } = await import("../src/settings/adjust.ts");

  it("is a signed adjust of one setting", () => {
    expect(yieldChange(true)).toEqual({ ok: true, action: { kind: "adjust", changes: { yieldEnabled: true } } });
    expect(yieldChange(false)).toEqual({ ok: true, action: { kind: "adjust", changes: { yieldEnabled: false } } });
  });

  it("is confirmed when the agent's own plan shows the setting in force", () => {
    const settings = { proposed: "1", day: 1, payee: "0x00000000000000000000000000000000000000b2", dailyCap: "1", signatureThreshold: "1", floorDays: 14, targetDays: 42, halted: false, haltCodes: [] };
    expect(settingsMatch({ yieldEnabled: true }, { ...settings, yieldEnabled: true })).toBe(true);
    expect(settingsMatch({ yieldEnabled: true }, { ...settings, yieldEnabled: false })).toBe(false);
    expect(settingsMatch({ yieldEnabled: false }, settings)).toBe(true);
  });
});


describe("what the withdrawals have earned", async () => {
  const { earnTotals } = await import("../src/activity/earn.ts");
  const out = (gain: string, fee: string) => ({ notice: { kind: "earn" as const, box: "profit" as const, deposit: false, name: "v", protocol: "Morpho", vault: EARN, amount: "1", counter: "1", apyBps: 0, gain, fee }, timestamp: 1 });

  it("adds the gain and the fee of every withdrawal and ignores deposits and other notices", () => {
    const deposit = { notice: { ...out("0", "0").notice, deposit: true, gain: undefined, fee: undefined }, timestamp: 2 };
    const other = { notice: { kind: "salary" as const, month: "2026-11", paid: "1", pending: "0" }, timestamp: 3 };
    expect(earnTotals([out("2114", "211"), deposit, other, out("1000", "100")])).toEqual({ gain: 3_114n, fee: 311n });
  });

  it("is zero when there is nothing", () => {
    expect(earnTotals([])).toEqual({ gain: 0n, fee: 0n });
  });
});
