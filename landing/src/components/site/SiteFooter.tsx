import { footer as c, NAV } from "@/content/landing";
import { Wordmark } from "./Wordmark";

export function SiteFooter() {
  return (
    <footer className="border-t border-edge bg-ground">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-[clamp(24px,4vw,64px)] py-14 max-md:px-[22px] md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-5 max-w-[360px] font-mono text-[12px] leading-relaxed text-ink-muted">{c.quote}</p>
        </div>
        <nav aria-label="Sections">
          <p className="font-mono text-[11px] uppercase tracking-[0.10em] text-ink-muted">On this page</p>
          <ul className="mt-3 flex flex-col gap-2 font-body text-[14px]">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="text-ink hover:text-accent-text">
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <a href="#ledger" className="text-ink hover:text-accent-text">
                Ledger
              </a>
            </li>
            <li>
              <a href="#limits" className="text-ink hover:text-accent-text">
                Declared limits
              </a>
            </li>
            <li>
              <a href="#faq" className="text-ink hover:text-accent-text">
                Questions
              </a>
            </li>
          </ul>
        </nav>
        <div className="flex flex-col justify-between gap-6">
          <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-ink">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ink" />
            {c.built}
          </p>
          <p className="font-mono text-[12px] text-ink-muted">{c.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
