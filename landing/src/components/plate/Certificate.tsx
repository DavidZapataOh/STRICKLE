import { existsSync } from "node:fs";
import { join } from "node:path";
import { certificate as c } from "@/content/landing";
import { Engraved, Plate } from "./Plate";

/** The assay certificate: the memo for the committee, and the code for the judge. */
export function Certificate() {
  const photo = existsSync(join(process.cwd(), "public", "media", "memo.jpg"));
  return (
    <Plate id={c.id} inner="py-[clamp(72px,10vw,128px)]">
      <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
        <div className="order-2 md:order-1">
          {photo ? (
            <figure className="frame aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/media/memo.jpg" alt="The technical memorandum printed and lying on limestone paving" />
            </figure>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center">
              <div className="certificate w-[min(100%,340px)] p-7">
                <div className="flex items-center justify-between">
                  <svg viewBox="0 0 48 48" width="18" height="18" fill="none" aria-hidden="true">
                    <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                    <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="3.5" />
                  </svg>
                  <span className="font-body text-[10px] uppercase tracking-[0.12em]">{c.paperTitle} · 2026</span>
                </div>
                <p className="mt-7 font-display text-[18px] font-extrabold leading-tight">
                  Prove the threshold.
                  <br />
                  <em className="font-bold">Keep the recipe.</em>
                </p>
                <ol className="mt-6 flex flex-col gap-1.5 font-body text-[11px]">
                  {c.toc.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                <p className="mt-7 pr-14 font-body text-[9.5px] uppercase tracking-[0.10em]">{c.paperFoot}</p>
                <span aria-hidden="true" className="seal" />
              </div>
            </div>
          )}
        </div>

        <div className="order-1 md:order-2">
          <Engraved size="lg">{c.title}</Engraved>
          <p className="mt-5 max-w-[52ch] font-body text-[16px] leading-relaxed text-steel-700 md:text-[17px]">{c.body}</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <a
              href={c.cta.href}
              className="inline-flex h-12 items-center rounded-[6px] px-5 font-body text-[15px] font-medium text-[var(--steel-50)]"
              style={{
                background: "linear-gradient(180deg, #2a2f37, #171a1f)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 0 rgba(255,255,255,0.5), 0 10px 20px -14px rgba(0,0,0,0.6)",
              }}
            >
              {c.cta.label}
            </a>
            <span className="font-body text-[13px] text-steel-600">{c.cta.note}</span>
          </div>

          <div id={c.code.id} className="mt-12 scroll-mt-[68px]">
            <hr className="score m-0 mb-6" />
            <Engraved as="h3" size="md">
              {c.code.title}
            </Engraved>
            <ul className="mt-4 flex flex-wrap gap-x-7 gap-y-2 font-body text-[15px]">
              {c.code.links.map((l) => (
                <li key={l.label} className="flex items-baseline gap-2">
                  <a href={l.href} aria-disabled="true" className="text-steel-900 underline decoration-steel-300 underline-offset-[6px]">
                    {l.label}
                  </a>
                  <span className="font-body text-[12px] text-steel-600">{l.status}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[12px] text-steel-600">{c.code.address}</p>
          </div>
        </div>
      </div>
    </Plate>
  );
}
