export const locales = ["en", "es", "pt-br"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const hasLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);
export const htmlLang: Record<Locale, string> = { en: "en", es: "es-419", "pt-br": "pt-BR" };
export const numberLocale: Record<Locale, string> = { en: "en-US", es: "es-419", "pt-br": "pt-BR" };
