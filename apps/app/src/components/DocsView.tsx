import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { fill } from "@/i18n/fill";
import { Card } from "@/ui/Card";
import type { Section, Topic } from "@/docs/types";

const REPOSITORY = "https://github.com/DavidZapataOh/STRICKLE";

export const sourceUrl = (path: string) => `${REPOSITORY}/${/\.[a-z]+$/.test(path) ? "blob" : "tree"}/main/${path}`;

export type DocsHit = { topic: Topic; section: Section };

function Sources({ sources, label }: { sources: string[]; label: string }) {
  return (
    <p className="note">
      {label}:{" "}
      {sources.map((path, index) => (
        <span key={path}>
          {index > 0 ? ", " : ""}
          <a className="proof-address" href={sourceUrl(path)} rel="noreferrer" target="_blank">
            {path}
          </a>
        </span>
      ))}
    </p>
  );
}

/** The index of topics with a search box; `query` and `hits` are set when a search was made. */
export function DocsIndex({ lang, t, topics, query, hits }: { lang: Locale; t: Pick<Dictionary, "screens">; topics: Topic[]; query: string | null; hits: DocsHit[] | null }) {
  const d = t.screens.docs;
  return (
    <>
      <h1 className="screen-title">{d.title}</h1>
      <p className="note">{d.intro}</p>
      <form method="get" action={`/${lang}/docs`} role="search" className="docs-search">
        <label htmlFor="docs-q">{d.searchLabel}</label>
        <input id="docs-q" name="q" type="search" maxLength={80} defaultValue={query ?? ""} />
        <button type="submit">{d.searchButton}</button>
      </form>
      {hits !== null && query !== null && hits.length > 0 ? (
        <Card as="section" aria-labelledby="docs-results">
          <h2 id="docs-results" className="section-title docs-echo">
            {fill(d.results, { count: hits.length, query })}
          </h2>
          <ul className="docs-list">
            {hits.map(({ topic, section }) => (
              <li key={`${topic.slug}-${section.id}`}>
                <a href={`/${lang}/docs/${topic.slug}#${section.id}`}>
                  {topic.title}: {section.title}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {hits !== null && query !== null && hits.length === 0 ? <p className="note docs-echo">{fill(d.nothing, { query })}</p> : null}
      <Card as="section" aria-labelledby="docs-topics">
        <h2 id="docs-topics" className="section-title">
          {d.topics}
        </h2>
        <ul className="docs-list">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <a href={`/${lang}/docs/${topic.slug}`}>{topic.title}</a>
              <span className="note"> {topic.summary}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function DocsTopic({ lang, t, topic }: { lang: Locale; t: Pick<Dictionary, "screens">; topic: Topic }) {
  const d = t.screens.docs;
  return (
    <>
      <p className="note">
        <a href={`/${lang}/docs`}>{d.back}</a>
      </p>
      <h1 className="screen-title">{topic.title}</h1>
      <p className="note">{topic.summary}</p>
      {topic.sections.map((section) => (
        <Card as="section" aria-labelledby={section.id} key={section.id}>
          <h2 id={section.id} className="section-title">
            {section.title}
          </h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <Sources sources={section.sources} label={d.sources} />
        </Card>
      ))}
    </>
  );
}
