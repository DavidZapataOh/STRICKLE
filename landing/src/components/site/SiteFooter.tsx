import { footer as c, SECTIONS } from "@/content/landing";
import { Wordmark } from "./Wordmark";

export function SiteFooter() {
  return (
    <footer className="plate plate-dark">
      <div className="relative mx-auto grid w-full max-w-[1320px] gap-10 px-[clamp(24px,4vw,72px)] py-14 max-md:px-[22px] md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="text-steel-50">
          <Wordmark className="text-steel-50" />
          <p className="mt-5 max-w-[40ch] font-body text-[13.5px] leading-relaxed text-steel-300">{c.quote}</p>
        </div>
        <nav aria-label="Sections">
          <p className="engraved font-display text-[13px] font-bold">On this plate</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-body text-[14px]">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-steel-100 hover:text-[var(--brass-hi)]">
                  {s.title.replace(/\.$/, "")}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col justify-between gap-6">
          <p className="engraved flex items-center gap-2 font-display text-[13px] font-bold text-steel-50">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brass-hi)]" />
            {c.built}
          </p>
          <p className="font-body text-[13px] text-steel-300">{c.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
