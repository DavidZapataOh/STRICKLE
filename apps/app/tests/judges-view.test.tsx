import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JudgesView } from "../src/components/JudgesView.tsx";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";
import { isPublicPath } from "../src/server/access.ts";
import { mariaDoor } from "../src/server/judges.ts";

const dictionaries = { en, es, "pt-br": pt } as const;
const VAULT = "0x14b5e469720A4cb071772258D9ac8f0B37Ab8D9A";
const client = (code: `0x${string}` | undefined | Error) => ({ getCode: async () => { if (code instanceof Error) throw code; return code; } });
const view = (lang: keyof typeof dictionaries, maria: Parameters<typeof JudgesView>[0]["maria"]) => renderToStaticMarkup(<JudgesView lang={lang} t={dictionaries[lang] as typeof en} maria={maria} />);

describe("mariaDoor", () => {
  it("opens only for a configured address that has code on the network", async () => {
    expect(await mariaDoor(client("0x6080"), VAULT)).toEqual({ status: "open", vault: VAULT });
    expect(await mariaDoor(client("0x"), VAULT)).toEqual({ status: "unavailable" });
    expect(await mariaDoor(client(undefined), VAULT)).toEqual({ status: "unavailable" });
    expect(await mariaDoor(client("0x6080"), null)).toEqual({ status: "unavailable" });
    expect(await mariaDoor(client("0x6080"), "not-an-address")).toEqual({ status: "unavailable" });
  });

  it("is unavailable, not an error, when the network cannot be read", async () => {
    expect(await mariaDoor(client(new Error("down")), VAULT)).toEqual({ status: "unavailable" });
  });
});

describe("JudgesView", () => {
  it("shows the three doors with their links in three languages", () => {
    for (const lang of ["en", "es", "pt-br"] as const) {
      const html = view(lang, { status: "open", vault: VAULT });
      expect(html).toContain(`href="/${lang}/view/${VAULT}"`);
      expect(html).toContain(`href="/${lang}/start"`);
      expect(html).toContain(`href="/${lang}/proof"`);
    }
  });

  it("offers no link to María when the account is unavailable or still being checked", () => {
    expect(view("en", { status: "unavailable" })).not.toContain("/view/");
    expect(view("en", { status: "unavailable" })).toContain("not available right now");
    expect(view("en", { status: "checking" })).not.toContain("/view/");
    expect(view("en", { status: "unavailable" })).toContain('href="/en/start"');
  });

  it("is public: no invitation is needed to see it", () => {
    expect(isPublicPath("/en/judges")).toBe(true);
  });
});
