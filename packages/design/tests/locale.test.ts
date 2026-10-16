// packages/design/tests/locale.test.ts
import { describe, expect, it } from "vitest";
import { defaultLocale, hasLocale, htmlLang, numberLocale, preferredLocale, resolveLocale } from "../src/locale.ts";

describe("preferredLocale", () => {
  it("falls back to the default without a header", () => {
    expect(preferredLocale(null)).toBe(defaultLocale);
    expect(preferredLocale("")).toBe(defaultLocale);
  });

  it("maps language tags to the three supported locales", () => {
    expect(preferredLocale("pt-BR,pt;q=0.9")).toBe("pt-br");
    expect(preferredLocale("es-CO,es;q=0.9,en;q=0.8")).toBe("es");
    expect(preferredLocale("en-GB")).toBe("en");
  });

  it("honours quality values and ignores unsupported languages", () => {
    expect(preferredLocale("fr-FR,es;q=0.4,pt;q=0.8")).toBe("pt-br");
    expect(preferredLocale("de,fr")).toBe(defaultLocale);
  });
});

describe("resolveLocale", () => {
  it("lets a valid lang parameter win over the browser's language", () => {
    expect(resolveLocale("es", "en-US")).toBe("es");
    expect(resolveLocale("PT-BR", "en")).toBe("pt-br");
  });

  it("ignores an invalid or missing lang parameter", () => {
    expect(resolveLocale("fr", "pt-BR")).toBe("pt-br");
    expect(resolveLocale("", "es")).toBe("es");
    expect(resolveLocale(null, null)).toBe(defaultLocale);
  });
});

describe("locale tables", () => {
  it("recognises only the three locales", () => {
    expect(["en", "es", "pt-br"].every(hasLocale)).toBe(true);
    expect(hasLocale("pt")).toBe(false);
    expect(hasLocale("EN")).toBe(false);
  });

  it("uses regional BCP 47 tags for the document language and number formatting", () => {
    expect(htmlLang).toEqual({ en: "en", es: "es-419", "pt-br": "pt-BR" });
    expect(numberLocale).toEqual({ en: "en-US", es: "es-419", "pt-br": "pt-BR" });
  });
});
