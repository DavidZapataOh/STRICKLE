import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import { AppShell } from "../src/ui/AppShell.tsx";

const render = (current: "home" | "activity" | "boxes" | "settings" | "verify" | "docs", actions?: React.ReactNode) =>
  renderToStaticMarkup(
    <AppShell lang="en" current={current} t={en} actions={actions}>
      <p>content</p>
    </AppShell>,
  );

describe("AppShell", () => {
  it("puts the skip link before everything and targets the main region", () => {
    const out = render("home");
    expect(out.indexOf('class="skip-link"')).toBeLessThan(out.indexOf("<header"));
    expect(out).toContain('href="#content"');
    expect(out).toContain('<main id="content"');
  });

  it("lists the four destinations in order with localized hrefs", () => {
    const out = render("home");
    const hrefs = [...out.matchAll(/<a class="nav-item"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(["/en", "/en/activity", "/en/boxes", "/en/settings"]);
  });

  it("marks only the current page", () => {
    const out = render("boxes");
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>(<[^>]+>)*Boxes/);
  });

  it("highlights nothing on a page outside the nav", () => {
    expect(render("verify")).not.toContain("aria-current");
    expect(render("docs")).not.toContain("aria-current");
  });

  it("mounts the actions slot in the header", () => {
    const out = render("home", <button type="button">Pause</button>);
    expect(out.indexOf("<header")).toBeLessThan(out.indexOf("Pause"));
    expect(out.indexOf("Pause")).toBeLessThan(out.indexOf("</header>"));
  });

  it("names the navigation for assistive technology", () => {
    expect(render("home")).toContain('aria-label="Main navigation"');
  });
});
