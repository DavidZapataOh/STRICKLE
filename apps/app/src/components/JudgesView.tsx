import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { MariaDoor } from "@/server/judges";
import { Card } from "@/ui/Card";

/** Three ways in for a first-time visitor: a real account read-only, the product on test money, and the checks anyone can make. */
export function JudgesView({ lang, t, maria }: { lang: Locale; t: Pick<Dictionary, "judges">; maria: MariaDoor | { status: "checking" } }) {
  const j = t.judges;
  return (
    <>
      <h1 className="screen-title">{j.title}</h1>
      <p className="note">{j.intro}</p>
      <Card as="section" aria-labelledby="door-maria">
        <h2 id="door-maria" className="section-title">
          {j.maria.title}
        </h2>
        <p>{j.maria.body}</p>
        {maria.status === "open" ? (
          <a className="btn" data-variant="primary" href={`/${lang}/view/${maria.vault}`}>
            {j.maria.open}
          </a>
        ) : (
          <p className="note">{maria.status === "checking" ? j.maria.checking : j.maria.unavailable}</p>
        )}
      </Card>
      <Card as="section" aria-labelledby="door-try">
        <h2 id="door-try" className="section-title">
          {j.try.title}
        </h2>
        <p>{j.try.body}</p>
        <a className="btn" data-variant="primary" href={`/${lang}/start`}>
          {j.try.open}
        </a>
      </Card>
      <Card as="section" aria-labelledby="door-check">
        <h2 id="door-check" className="section-title">
          {j.check.title}
        </h2>
        <p>{j.check.body}</p>
        <a className="btn" data-variant="primary" href={`/${lang}/proof`}>
          {j.check.open}
        </a>
      </Card>
    </>
  );
}
