import { existsSync } from "node:fs";
import { join } from "node:path";
import { closing as c } from "@/content/landing";
import { MemoFigure } from "./MemoFigure";
import { Section, SectionTitle } from "./Section";

export function Closing() {
  const photo = existsSync(join(process.cwd(), "public", "media", "memo.jpg"));
  return (
    <Section id={c.id} className="border-t border-edge" inner="grid items-center gap-12 md:grid-cols-2 md:gap-16">
      <div className="rise rise-1 order-2 md:order-1">
        <MemoFigure photo={photo} />
      </div>
      <div className="order-1 md:order-2">
        <SectionTitle kicker={c.kicker} title={c.title} intro={c.body} />
        <ol className="rise rise-3 mt-6 flex flex-col gap-1.5 font-mono text-[12.5px] text-ink-muted">
          {c.toc.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        <div className="rise rise-3 mt-7">
          <a
            href={c.cta.href}
            className="inline-flex h-11 items-center rounded-[4px] bg-ink px-5 font-body text-[15px] font-medium text-ground"
          >
            {c.cta.label}
          </a>
        </div>

        <div id={c.code.id} className="rise rise-4 mt-12 scroll-mt-[68px] border-t border-edge pt-6">
          <h3 className="font-display text-[19px] font-bold text-ink">{c.code.title}</h3>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[13px]">
            {c.code.links.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="text-ink underline decoration-edge underline-offset-4 hover:decoration-ink">
                  {l.label} →
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">{c.code.address}</p>
        </div>
      </div>
    </Section>
  );
}
