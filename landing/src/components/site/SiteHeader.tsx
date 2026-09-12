import { NAV } from "@/content/landing";
import { Wordmark } from "./Wordmark";

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-[68px] w-full max-w-[1320px] items-center justify-between px-[clamp(24px,4vw,72px)] max-md:px-[22px]">
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
        className="header-chip inline-flex h-10 items-center rounded-[6px] px-4 font-body text-[14px] font-medium text-ink"
      >
        Read the memo
      </a>
    </header>
  );
}
