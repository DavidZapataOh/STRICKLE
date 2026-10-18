import type { Locale } from "@/i18n/config";
import { topicsFor } from "./topics";
import type { Section, Topic } from "./types";

const MAX_QUERY = 80;

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Sections whose title or text contain every word of the query, in the order of the documentation. Accents and case do not matter. */
export function search(lang: Locale, query: string): { topic: Topic; section: Section }[] {
  const words = fold(query.trim().slice(0, MAX_QUERY)).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return topicsFor(lang).flatMap((topic) =>
    topic.sections
      .filter((section) => {
        const haystack = fold(`${topic.title} ${section.title} ${section.body.join(" ")}`);
        return words.every((word) => haystack.includes(word));
      })
      .map((section) => ({ topic, section })),
  );
}
