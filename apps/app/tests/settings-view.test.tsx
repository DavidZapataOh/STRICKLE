import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import type { SettingsModel } from "../src/settings/model.ts";
import { RulesPanel } from "../src/components/RulesPanel.tsx";
import { SettingsView } from "../src/components/SettingsView.tsx";
import type { BoxState } from "../src/chain/vault.ts";

const payee = "0x00000000000000000000000000000000000000b2" as const;
const model = (patch: Partial<SettingsModel> = {}): SettingsModel => ({
  agent: { state: "running", haltCodes: [] },
  limits: { capUnits: 100_000_000n, windowHours: 24 },
  plan: "fresh", asOf: "2026-11-01", autonomy: "ask", threshold: 0n, dailyCap: 100_000_000n,
  salary: { proposed: 1_000_000_000n, day: 1, payee, payeeApproval: "effective", payeeEffectiveAt: 1 },
  cushion: { floorDays: 14, targetDays: 42 },
  ...patch,
});
// React escapes apostrophes in markup
const escaped = (text: string) => text.replaceAll("'", "&#x27;");
const render = (state: Parameters<typeof SettingsView>[0]["state"]) => renderToStaticMarkup(<SettingsView lang="en" t={en} state={state} />);

describe("SettingsView", () => {
  it("shows what is in force with real amounts and states what pause does and does not stop", () => {
    const out = render({ status: "ready", model: model() });
    expect(out).toContain("US$100.00");
    expect(out).toContain("24");
    expect(out).toContain("US$1,000.00");
    expect(out).toContain(en.settings.agent.runningNote);
  });

  it("explains a pause honestly", () => {
    const out = render({ status: "ready", model: model({ agent: { state: "paused", haltCodes: [] } }) });
    expect(out).toContain(en.settings.agent.pausedNote);
  });

  it("names the codes of a safety stop and offers no resume", () => {
    const out = render({ status: "ready", model: model({ agent: { state: "halted-safety", haltCodes: ["books-balance"] } }) });
    expect(out).toContain("books-balance");
    expect(out).not.toContain(en.settings.agent.resumeInAgent);
  });

  it("offers to resume only a pause that lives inside the agent", () => {
    expect(render({ status: "ready", model: model({ agent: { state: "halted-user", haltCodes: ["user-pause"] } }) })).toContain(en.settings.agent.resumeInAgent);
  });

  it("says plainly when the plan cannot be read and still shows the vault's own limits", () => {
    const out = render({ status: "ready", model: model({ plan: "missing", asOf: null, autonomy: "unknown", threshold: null, salary: null, cushion: null }) });
    expect(out).toContain(escaped(en.settings.planMissing));
    expect(out).toContain("US$100.00");
  });

  it("has loading, error and signed-out states", () => {
    expect(render({ status: "loading" })).toContain("skeleton");
    expect(render({ status: "error" })).toContain(en.settings.error);
    expect(render({ status: "signedOut" })).toContain(en.settings.signedOut);
  });
});

const box = (id: number, patch: Partial<BoxState["rule"]> = {}): BoxState => ({
  kind: (["taxes", "payroll", "salary", "operating", "emergency", "profit"] as const)[id - 1]!, id, usdc: 0n, eurc: 0n, invested: 0n,
  rule: { delaySeconds: 0, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0, ...patch },
});
const run = async () => "done" as const;
const panel = (pending: Parameters<typeof RulesPanel>[0]["pending"], now = 1_800_000_000) =>
  renderToStaticMarkup(<RulesPanel lang="en" t={en} boxes={[1, 2, 3, 4, 5, 6].map((id) => box(id, id === 1 ? { delaySeconds: 172_800, alwaysDelayed: true } : {}))} vault="0x00000000000000000000000000000000000000a1" pending={pending} now={now} busy={false} onRun={run} readBox={async () => ({ rule: box(1).rule, pending: null })} />);

describe("RulesPanel", () => {
  const none = [null, null, null, null, null, null];

  it("shows each box's rule in words", () => {
    const out = panel(none);
    expect(out).toContain("Withdrawals wait 48 h");
    expect(out).toContain("Free to move");
  });

  it("shows a looser pending change with its date and the one action it still needs", () => {
    const pending = [{ box: 1, rule: { delaySeconds: 3_600, alwaysDelayed: false, restricted: false, floor: 0n, lockedUntil: 0 }, effectiveAt: 1_800_172_800 }, null, null, null, null, null];
    const before = panel(pending);
    expect(before).toContain("Jan 17");
    expect(before).not.toContain(en.rules.apply);
    expect(before).toContain(en.rules.cancel);
    const after = panel(pending, 1_800_172_801);
    expect(after).toContain(en.rules.apply);
  });
});
