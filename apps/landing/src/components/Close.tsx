"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { locales, numberLocale } from "@/i18n/config";
import { APP_URL, money } from "@/lib/design";
import { StruckS } from "./StruckS";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const SALARY = 2080;
const LANG_LABEL: Record<Locale, string> = { en: "EN", es: "ES", "pt-br": "PT" };

export function Close({ t, lang }: { t: Dictionary; lang: Locale }) {
  const c = t.close;
  const root = useRef<HTMLElement>(null);
  const months = Array.from({ length: 12 }, (_, m) =>
    new Intl.DateTimeFormat(numberLocale[lang], { month: "short", timeZone: "UTC" })
      .format(Date.UTC(2027, m, 1))
      .replace(".", "")
      .toUpperCase(),
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: "top 62%", once: true },
          defaults: { ease: "power3.out" },
        });
        tl.from("[data-level]", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.45 }, 0);
        tl.from(
          "[data-payday]",
          { y: (i) => -70 - (i % 3) * 18, rotation: (i) => [-6, 4, -3, 7][i % 4], duration: 0.55, stagger: 0.07 },
          0.15,
        );
        tl.from("[data-payday] [data-tick]", { scale: 0, duration: 0.25, stagger: 0.07 }, 0.5);
      });
    },
    { scope: root },
  );

  return (
    <>
      <section ref={root} aria-labelledby="close-title" className="w-full bg-hibiscus text-blush" style={{ paddingBlock: "var(--section-y) calc(var(--section-y) * 0.85)" }}>
        <div className="wrap">
          <h2
            id="close-title"
            className="font-display"
            style={{ fontSize: "min(var(--fs-mega), 14vw)", fontWeight: 800, lineHeight: 0.88, letterSpacing: "-0.05em" }}
          >
            <span className="block">{c.line1}</span>
            <span className="block">{c.line2}</span>
          </h2>

          <ol aria-hidden className="mt-[clamp(28px,2.6vw,40px)] grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 xl:grid-cols-12">
            {months.map((m) => (
              <li
                key={m}
                data-payday
                className="flex min-w-0 flex-col items-center rounded-[clamp(8px,0.7vw,10px)] bg-blush pt-[clamp(10px,1.4vw,22px)] pb-[clamp(8px,0.8vw,12px)] text-night"
              >
                <span style={{ fontSize: "clamp(0.75rem, 0.66rem + 0.3vw, 1.0625rem)", fontWeight: 600, letterSpacing: "0.02em" }}>{m}</span>
                <span className="mt-1 font-mono" style={{ fontSize: "clamp(1.375rem, 1.05rem + 0.9vw, 2.25rem)", fontWeight: 500, lineHeight: 1 }}>
                  1
                </span>
                <span className="mt-[clamp(6px,0.7vw,12px)] font-mono tabular" style={{ fontSize: "clamp(0.75rem, 0.6rem + 0.3vw, 1rem)" }}>
                  {money(SALARY, lang)}
                </span>
                <svg data-tick viewBox="0 0 24 24" fill="none" className="mt-1 size-[clamp(14px,1.3vw,22px)] text-calyx">
                  <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
            ))}
          </ol>
          <div data-level aria-hidden className="mt-[clamp(14px,1.4vw,22px)] h-[3px] rounded-sm" style={{ background: "color-mix(in oklab, var(--blush) 75%, transparent)" }} />

          <div className="mt-[clamp(28px,3.6vw,58px)] flex flex-col items-stretch gap-x-10 gap-y-5 sm:flex-row sm:items-center">
            <a
              href={APP_URL}
              className="group flex h-[clamp(56px,4.4vw,76px)] items-center justify-center gap-[clamp(12px,1.2vw,20px)] rounded-[clamp(14px,1.2vw,18px)] bg-blush px-[clamp(28px,2.6vw,44px)] text-hibiscus transition-colors duration-150 hover:bg-husk active:bg-husk"
              style={{ fontSize: "clamp(1.1875rem, 0.95rem + 0.75vw, 1.75rem)", fontWeight: 700, letterSpacing: "-0.01em" }}
            >
              {c.cta}
              <svg aria-hidden viewBox="0 0 24 24" className="size-[clamp(20px,1.7vw,26px)] transition-transform duration-200 group-hover:translate-x-1" fill="none">
                <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href={`${APP_URL}/verify`}
              className="self-center py-2 underline decoration-blush/60 transition-colors duration-150 hover:decoration-blush"
              style={{ fontSize: "clamp(1rem, 0.85rem + 0.5vw, 1.5rem)", fontWeight: 500, textUnderlineOffset: "0.45em", textDecorationThickness: "1.5px" }}
            >
              {c.verify}
            </a>
          </div>
        </div>
      </section>

      <footer className="w-full bg-night text-blush" style={{ paddingBlock: "clamp(36px, 3vw, 46px) clamp(40px, 3vw, 46px)" }}>
        <div className="wrap">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-10">
            <a href={`/${lang}`} className="flex items-center gap-[clamp(12px,1.4vw,22px)] self-start">
              <span className="size-[clamp(36px,3.4vw,52px)]">
                <StruckS className="block h-full w-full text-hibiscus-light" title="Strickle" />
              </span>
              <span aria-hidden className="font-display" style={{ fontSize: "clamp(1.625rem, 1.3rem + 0.75vw, 2.25rem)", fontWeight: 800, letterSpacing: "-0.03em" }}>
                Strickle
              </span>
            </a>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-[clamp(28px,4vw,64px)] gap-y-2" style={{ fontSize: "clamp(1rem, 0.92rem + 0.25vw, 1.25rem)" }}>
                <li><a className="inline-block py-2 transition-colors hover:text-hibiscus-light" href={APP_URL}>{c.links.app}</a></li>
                <li><a className="inline-block py-2 transition-colors hover:text-hibiscus-light" href={`${APP_URL}/verify`}>{c.links.verify}</a></li>
                <li><a className="inline-block py-2 transition-colors hover:text-hibiscus-light" href={`${APP_URL}/docs`}>{c.links.docs}</a></li>
              </ul>
            </nav>
            <ul aria-label={t.nav.language} className="flex items-center gap-3 lg:justify-end" style={{ fontSize: "clamp(0.9375rem, 0.9rem + 0.12vw, 1.0625rem)" }}>
              {locales.map((l, i) => (
                <li key={l} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden className="text-blush/50">·</span>}
                  <a
                    href={`/${l}`}
                    hrefLang={l}
                    aria-current={l === lang ? "page" : undefined}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center ${l === lang ? "font-bold" : "text-blush/70 transition-colors hover:text-blush"}`}
                  >
                    {LANG_LABEL[l]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="mt-[clamp(20px,2vw,28px)] h-px" style={{ background: "color-mix(in oklab, var(--blush) 18%, transparent)" }} />
          <div className="mt-[clamp(18px,2.4vw,36px)] flex flex-col gap-2.5 text-blush/80 lg:flex-row lg:justify-between lg:gap-10" style={{ fontSize: "clamp(0.8125rem, 0.78rem + 0.15vw, 1rem)", lineHeight: 1.5 }}>
            <p className="max-w-[72ch]">{c.legal}</p>
            <p className="shrink-0">{c.built}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
