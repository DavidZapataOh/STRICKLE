import "server-only";
import type { Locale } from "./config";

const dictionaries = {
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  es: () => import("./dictionaries/es.json").then((m) => m.default),
  "pt-br": () => import("./dictionaries/pt-br.json").then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["en"]>>;
export const getDictionary = async (locale: Locale): Promise<Dictionary> => dictionaries[locale]();
