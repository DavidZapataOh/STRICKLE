import { Wordmark } from "./Wordmark";

const NAV = [
  { label: "Product", href: "#" },
  { label: "Proof", href: "#" },
  { label: "Docs", href: "#" },
];

export function SiteHeader() {
  return (
    <header className="flex h-[68px] items-center justify-between px-[clamp(24px,4vw,64px)] max-md:px-[22px]">
      <Wordmark />
      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        {NAV.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="font-body text-[15px] font-medium text-ink hover:text-accent-text"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <a
        href="#"
        className="inline-flex h-11 items-center rounded-[4px] bg-ink px-5 font-body text-[15px] font-medium text-ground"
      >
        Open the console
      </a>
    </header>
  );
}
