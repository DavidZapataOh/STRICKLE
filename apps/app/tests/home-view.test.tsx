import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type ScreenState, HomeView } from "../src/components/HomeView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { planNotice, snapshotOf, vaultState } from "./fixtures-plan.ts";

const view = (state: ScreenState, t: typeof en = en, lang: "en" | "es" | "pt-br" = "en", today = "2026-11-01") => renderToStaticMarkup(<HomeView lang={lang} t={t} state={state} today={today} />);
const ready = (patch: Parameters<typeof snapshotOf>[0] = {}): ScreenState => ({ status: "ready", snapshot: snapshotOf(patch) });
const salary = (patch: Partial<ReturnType<typeof planNotice>["salary"]>) => planNotice({ salary: { ...planNotice().salary, ...patch } });

describe("HomeView", () => {
  it("shows the next salary as secured, the strip, the share above the floor and the dated rows", () => {
    const out = view(ready());
    expect(out).toContain("Next salary");
    expect(out).toContain("Secured");
    expect(out).toContain("US$1,800.00");
    expect(out).toContain("Dec 1");
    expect(out).toContain("98% of scenarios stay above your floor");
    expect(out).toContain("42 days of cushion");
    expect(out).toContain("US$270.00 set aside");
    expect(out.match(/class="row"/g)).toHaveLength(2);
  });

  it("links to the deposit screen once the account is ready", () => {
    expect(view(ready())).toContain('href="/en/deposit"');
    expect(view(ready(), es as typeof en, "es")).toContain('href="/es/deposit"');
  });

  it("takes the percentage from the notice, never from a constant", () => {
    const changed = view(ready({ plan: salary({ aboveFloorBps: 9100 }) }));
    expect(changed).toContain("91% of scenarios stay above your floor");
    expect(changed).not.toContain("98%");
  });

  it("says when the forecast rests on the user's own estimate", () => {
    expect(view(ready({ plan: planNotice({ forecast: { ...planNotice().forecast, basis: "estimate" } }) }))).toContain("Built on the income you estimated");
    expect(view(ready())).not.toContain("Built on the income you estimated");
  });

  it("does not say secured when the plan is old, and says when it was last checked", () => {
    const out = view(ready(), en, "en", "2026-11-08");
    expect(out).not.toContain("Secured");
    expect(out).toContain("Last checked Nov 1");
  });

  it("asks for approval instead of promising when a signature is needed", () => {
    const out = view(ready({ plan: salary({ needsApproval: true }) }));
    expect(out).toContain("Waiting for your approval");
    expect(out).not.toContain(">Secured<");
    expect(out).toContain('href="/en/activity"');
  });

  it("explains a partly secured salary with the amount and the reason", () => {
    const out = view(ready({ plan: salary({ safeNow: "500000000", pending: "1300000000", binding: "cushion-floor" }) }));
    expect(out).toContain("Partly secured");
    expect(out).toContain("US$500.00 can be paid on that day");
    expect(out).toContain("Your cushion would drop below its floor.");
    expect(out).not.toContain(">Secured<");
  });

  it("puts the salary on hold, and says why, while the agent is paused", () => {
    const out = view(ready({ vault: vaultState({}, { agentPaused: true }) }));
    expect(out).toContain("On hold");
    expect(out).toContain("Your agent is paused. Nothing moves until you resume it.");
    expect(out).not.toContain(">Secured<");
  });

  it("says this device cannot read the plan, and the plan is on its way", () => {
    expect(view(ready({ key: "missing", plan: null }))).toContain("This device cannot read your plan");
    expect(view(ready({ plan: null }))).toContain("Your plan is on its way");
  });

  it("says activity is unavailable without hiding the rest", () => {
    expect(view(ready({ activity: "unavailable", plan: null }))).toContain("Your activity is unavailable right now");
    expect(view(ready({ activity: "unavailable" }))).toContain("Your activity is unavailable right now");
  });

  it("covers signed out, loading and error with an action each", () => {
    expect(view({ status: "signedOut" })).toMatch(/href="\/en\/start"/);
    expect(view({ status: "signedOut" })).toMatch(/href="\/en\/start\?mode=login"/);
    expect(view({ status: "loading" })).toContain("Loading your plan");
    expect(view({ status: "error" })).toContain("Try again");
  });

  it("renders in Spanish and Portuguese with their own words and number formats", () => {
    const pt_ = view(ready(), pt, "pt-br");
    expect(pt_).toContain("Próximo salário");
    expect(pt_).toContain("Coberto");
    expect(pt_).toContain("US$ 1.800,00");
    const es_ = view(ready(), es, "es");
    expect(es_).toContain("Cubierto");
    expect(es_).not.toContain("Asegurado");
    expect(pt_).not.toContain("Garantido");
  });

  it("never prints NaN or undefined, even with an empty forecast, no events and an impossible date", () => {
    const bare = planNotice({ forecast: { floor: "0", opening: "0", p10: [], p50: [], basis: "observed" }, events: [{ date: "2026-02-31", kind: "tax", amount: null }], cushion: { days: null, floorDays: 14, targetDays: 42 } });
    const out = view(ready({ plan: bare }));
    expect(out).not.toMatch(/NaN|undefined|Infinity/);
    expect(out).toContain("Set your monthly spending to see your cushion");
    expect(out).toContain("2026-02-31");
  });
});
