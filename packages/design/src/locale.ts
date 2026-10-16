export const locales = ["en", "es", "pt-br"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const hasLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value);

export const htmlLang: Record<Locale, string> = { en: "en", es: "es-419", "pt-br": "pt-BR" };
export const numberLocale: Record<Locale, string> = { en: "en-US", es: "es-419", "pt-br": "pt-BR" };

export function preferredLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (tag.startsWith("pt")) return "pt-br";
    if (tag.startsWith("es")) return "es";
    if (tag.startsWith("en")) return "en";
  }
  return defaultLocale;
}

// The landing hands the visitor's language to the app as `lang`; an explicit choice beats the browser's guess.
export function resolveLocale(queryLang: string | null, acceptLanguage: string | null): Locale {
  const requested = queryLang?.toLowerCase() ?? "";
  return hasLocale(requested) ? requested : preferredLocale(acceptLanguage);
}
