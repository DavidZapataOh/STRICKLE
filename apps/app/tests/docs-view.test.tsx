import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocsIndex, DocsTopic, sourceUrl } from "../src/components/DocsView.tsx";
import { search } from "../src/docs/search.ts";
import { TOPIC_SLUGS, topicBySlug, topicsFor } from "../src/docs/topics.ts";
import en from "../src/i18n/dictionaries/en.json";
import es from "../src/i18n/dictionaries/es.json";
import pt from "../src/i18n/dictionaries/pt-br.json";

const dictionaries = { en, es, "pt-br": pt } as const;
const langs = ["en", "es", "pt-br"] as const;
const index = (lang: (typeof langs)[number], query: string | null = null) =>
  renderToStaticMarkup(<DocsIndex lang={lang} t={dictionaries[lang] as typeof en} topics={topicsFor(lang)} query={query} hits={query === null ? null : search(lang, query)} />);

describe("documentation pages", () => {
  it("lists every topic with a link in all three languages", () => {
    for (const lang of langs) {
      const html = index(lang);
      for (const topic of topicsFor(lang)) expect(html).toContain(`href="/${lang}/docs/${topic.slug}"`);
      expect(html).toContain('role="search"');
    }
  });

  it("shows search hits as links to the section, and says so when there are none", () => {
    expect(index("en", "salary")).toContain('href="/en/docs/how-it-works#salary"');
    expect(index("en", "zzzqqq")).toContain("Nothing found for “zzzqqq”");
    expect(index("es", "zzzqqq")).toContain("No se encontró nada");
  });

  it("escapes the query it echoes", () => {
    const html = index("en", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a topic with each section and its sources linked to the repository", () => {
    for (const lang of langs) {
      const topic = topicBySlug(lang, "rules");
      expect(topic).toBeDefined();
      const html = renderToStaticMarkup(<DocsTopic lang={lang} t={dictionaries[lang] as typeof en} topic={topic as NonNullable<typeof topic>} />);
      for (const section of (topic as NonNullable<typeof topic>).sections) expect(html).toContain(`id="${section.id}"`);
      expect(html).toContain(sourceUrl("contracts/src/vault/BoxVault.sol"));
    }
    expect(sourceUrl("packages/tax-engine/rules")).toContain("/tree/main/");
  });

  it("has no topic outside the list and no unknown slug", () => {
    expect(topicBySlug("en", "nope")).toBeUndefined();
    expect(TOPIC_SLUGS).toEqual(topicsFor("en").map((topic) => topic.slug));
  });

  it("no longer says the documentation is not published", () => {
    for (const lang of langs) expect(JSON.stringify(dictionaries[lang].screens.docs)).not.toMatch(/not published|no está publicada|ainda não está publicada|aún no está publicada/i);
  });
});
