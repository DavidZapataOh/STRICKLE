import type { Locale } from "@/i18n/config";

export interface Section {
  id: string;
  title: string;
  body: string[];
  /** Repository paths the claims of the section rest on; each must exist. */
  sources: string[];
}

export interface Topic {
  slug: string;
  title: string;
  summary: string;
  sections: Section[];
}

export type Translated = Record<Locale, Topic>;
