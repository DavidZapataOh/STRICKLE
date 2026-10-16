import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { StruckS } from "./StruckS";

const ITEMS = [
  { key: "home", path: "" },
  { key: "activity", path: "/activity" },
  { key: "boxes", path: "/boxes" },
  { key: "settings", path: "/settings" },
] as const;

export type ShellPage = (typeof ITEMS)[number]["key"] | "verify" | "docs";

export function AppShell({ lang, current, t, actions, children }: { lang: Locale; current: ShellPage; t: Dictionary; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="shell">
      <a className="skip-link" href="#content">
        {t.nav.skip}
      </a>
      <header className="shell-header">
        <a className="brand" href={`/${lang}`} aria-label={t.shell.brand}>
          <StruckS className="brand-mark" />
        </a>
        <div className="shell-actions">{actions}</div>
      </header>
      <nav className="shell-nav" aria-label={t.nav.primary}>
        {ITEMS.map(({ key, path }) => (
          <Link key={key} className="nav-item" href={`/${lang}${path}`} aria-current={current === key ? "page" : undefined}>
            <span>{t.nav[key]}</span>
          </Link>
        ))}
      </nav>
      <main id="content" className="shell-main">
        {children}
      </main>
    </div>
  );
}
