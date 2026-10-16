import Link from "next/link";
import { useEffect, useState } from "react";
import { BOX_KINDS } from "@strickle/core";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { type Outcome, watchAgent } from "@/onboarding/create";

export function DonePanel({ lang, t, outcome }: { lang: Locale; t: Dictionary; outcome: Outcome }) {
  const d = t.start.done;
  const [agent, setAgent] = useState<"reading" | "ready" | "waiting">("reading");
  useEffect(() => {
    const controller = new AbortController();
    watchAgent(outcome.vault, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setAgent(result);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [outcome.vault]);
  return (
    <section className="done" aria-labelledby="done-title">
      <h2 id="done-title">{d.title}</h2>
      <p>
        {d.account}: <span className="amount" data-testid="account-address">{outcome.owner}</span>
      </p>
      <p>{d.boxes}</p>
      <ul className="done-boxes">
        {BOX_KINDS.map((box) => (
          <li key={box}>{t.boxes[box]}</li>
        ))}
      </ul>
      <p role="status">{agent === "ready" ? d.ready : d.reading}</p>
      {agent === "waiting" ? <p>{d.waiting}</p> : null}
      <p>{t.start.review.approval}</p>
      <p>{t.start.review.firstSalary}</p>
      <Link className="btn" data-variant="primary" href={`/${lang}`}>
        {d.go}
      </Link>
    </section>
  );
}
