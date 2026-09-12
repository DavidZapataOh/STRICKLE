import { NAV } from "@/content/landing";
import { Wordmark } from "./Wordmark";

export function SiteHeader() {
  return (
    <header className="flex h-[68px] items-center justify-between px-[clamp(24px,4vw,64px)] max-md:px-[22px]">
      <Wordmark />
      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        {NAV.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="font-body text-[14px] font-medium text-ink hover:text-accent-text"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <a
        href="#memo"
        className="inline-flex h-10 items-center rounded-[4px] border border-ink/40 px-4 font-body text-[14px] font-medium text-ink hover:border-ink"
      >
        Read the memo
      </a>
    </header>
  );
}
