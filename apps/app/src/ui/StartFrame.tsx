import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { StruckS } from "./StruckS";

/** The focused header of the onboarding: the brand, where the user is, and the test-network notice. No navigation: it is one task. */
export function StartFrame({ lang, brand, skip, progress, testnet, children }: { lang: Locale; brand: string; skip: string; progress: string | null; testnet: string | null; children: ReactNode }) {
  return (
    <div className="start-frame">
      <a className="skip-link" href="#content">
        {skip}
      </a>
      <header className="start-header">
        <Link className="brand" href={`/${lang}`} prefetch={false} aria-label={brand}>
          <StruckS className="brand-mark" />
        </Link>
        {progress ? <p className="start-progress">{progress}</p> : null}
        {testnet ? <span className="chip" data-tone="neutral">{testnet}</span> : null}
      </header>
      <main id="content" className="start-main">
        {children}
      </main>
    </div>
  );
}
