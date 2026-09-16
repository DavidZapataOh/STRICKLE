import { Strike } from "@/components/reveal/Strike";
import { law as c } from "@/content/landing";
import { Engraved, Plate } from "./Plate";

function Flaps({ text, row }: { text: string; row: number }) {
  return (
    <span className="flap-text inline-flex whitespace-nowrap" aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="flap"
          style={{ ["--i" as string]: i, ["--r" as string]: row }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

/** The law, billed by size alone, then the four clocks on a ruled board. */
export function Law() {
  return (
    <Plate id={c.id} inner="py-[clamp(72px,10vw,128px)]">
      <div className="grid gap-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-end">
        <Engraved size="lg">{c.title}</Engraved>
        <p className="font-body text-lead leading-relaxed text-steel-700">{c.intro}</p>
      </div>

      <ol className="mt-[clamp(40px,6vw,72px)]">
        {c.clauses.map((cl) => (
          <li
            key={cl.ref}
            className="grid gap-x-10 gap-y-3 py-9 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:py-12"
          >
            <hr className="score col-span-full m-0 -mt-9 mb-6 md:-mt-12 md:mb-8" />
            <div>
              <p className="engraved font-display text-display-2 font-extrabold leading-none tracking-[-0.02em]">
                {cl.ref}
              </p>
              {cl.sub && <p className="mt-2 font-body text-small text-steel-600">{cl.sub}</p>}
            </div>
            <div className="md:pt-2">
              <blockquote className="font-display text-quote font-bold leading-snug text-steel-900 [text-wrap:pretty]">
                <span aria-hidden="true">“</span>
                {cl.quote}
                <span aria-hidden="true">”</span>
              </blockquote>
              <p className="mt-4 max-w-[52ch] font-body text-body leading-relaxed text-steel-600">
                {cl.reading}
              </p>
            </div>
          </li>
        ))}
        <li aria-hidden="true">
          <hr className="score m-0" />
        </li>
      </ol>

      <div className="mt-[clamp(48px,7vw,96px)] grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] md:items-start">
        <Engraved as="h3" size="md" className="md:pt-3">
          {c.boardTitle}
        </Engraved>
        <Strike as="div" threshold={0.5} className="board overflow-hidden rounded-[8px]">
          <ol>
            {c.clocks.map((k, r) => (
              <li key={k.when} className={`board-row ${k.delayed ? "is-delayed" : ""}`}>
                <span aria-hidden="true" className={`lamp ${k.delayed ? "lamp-on" : ""}`} />
                <span className="font-display text-quote font-extrabold leading-none tabular-nums">
                  <Flaps text={k.when} row={r} />
                </span>
                <span className="font-body text-small leading-snug text-steel-100">{k.what}</span>
                <span className="font-mono text-micro text-steel-300">{k.ref}</span>
                <span
                  className={`font-body text-caption ${k.delayed ? "flap-text" : "text-steel-300"}`}
                >
                  {k.status}
                </span>
              </li>
            ))}
          </ol>
        </Strike>
      </div>
    </Plate>
  );
}
