import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SandboxControls } from "../src/components/SandboxControls.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";

const dictionaries = { en, es, "pt-br": pt } as const;
const view = (lang: keyof typeof dictionaries, over: Partial<Parameters<typeof SandboxControls>[0]> = {}) =>
  renderToStaticMarkup(<SandboxControls t={dictionaries[lang] as typeof en} date="2026-11-03" busy={false} failed={false} onAdvance={() => {}} {...over} />);

describe("SandboxControls", () => {
  it("shows the three steps, the account's date and the faucet in a new tab, in three languages", () => {
    for (const lang of ["en", "es", "pt-br"] as const) {
      const html = view(lang);
      expect(html).toContain("2026-11-03");
      expect((html.match(/<button/g) ?? []).length).toBe(3);
      expect(html).toContain('href="https://faucet.circle.com"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noreferrer"');
    }
    expect(view("en")).toContain("test money");
  });

  it("disables the steps while one is in flight and says when the date did not move", () => {
    expect(view("en", { busy: true })).toContain("disabled");
    expect(view("en", { failed: true })).toContain("The date did not move");
    expect(view("en", { failed: false })).not.toContain("The date did not move");
  });

  it("omits the date until the plan is known", () => {
    expect(view("en", { date: null })).not.toContain("The account&#x27;s date");
  });
});
