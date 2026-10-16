import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import type { SettingsModel } from "../src/settings/model.ts";
import { SettingsView } from "../src/components/SettingsView.tsx";

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
