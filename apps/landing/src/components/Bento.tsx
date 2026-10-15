"use client";

import { useState, type ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { numberLocale } from "@/i18n/config";
import { money } from "@/lib/design";
import { StruckS } from "./StruckS";

const ISSUED = Date.UTC(2026, 10, 1);

/* grid placement: one column on phones, two on tablets, the approved asymmetric arrangement on desktop */
const AREA = {
  cert: "sm:row-span-2 lg:[grid-area:cert]",
  pause: "lg:[grid-area:pause]",
  receipt: "lg:[grid-area:receipt]",
  taxes: "lg:[grid-area:taxes]",
  private: "lg:[grid-area:private]",
  mirror: "sm:col-span-2 lg:[grid-area:mirror]",
  guarantee: "sm:col-span-2 lg:[grid-area:guar]",
};

function Card({
  id,
  area,
  dark,
  fill,
  title,
  body,
  children,
}: {
  id?: string;
  area: string;
  fill?: boolean;
  dark?: boolean;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <article
      id={id}
      className={`group @container flex flex-col rounded-[22px] p-[clamp(20px,1.6vw,32px)] transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1 ${area} ${
        dark
          ? "bg-night text-blush hover:shadow-[0_18px_40px_rgba(34,20,26,0.28)]"
          : "border-[1.5px] border-line bg-card hover:shadow-[0_18px_40px_rgba(34,20,26,0.10)]"
      }`}
    >
      <h3 className="font-display" style={{ fontSize: "var(--fs-h3)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
        {title}
      </h3>
      <p className={`mt-1.5 ${dark ? "text-blush/80" : "text-clay"}`} style={{ fontSize: "var(--fs-small)", lineHeight: 1.35 }}>
        {body}
      </p>
      <div className={fill ? "flex flex-1 flex-col pt-5" : "mt-auto pt-5"}>{children}</div>
    </article>
  );
}

const Icon = {
  check: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  calendar: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  warn: (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className="h-full w-full">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.5v4M8 11v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  bank: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M3.5 9 12 4l8.5 5M5 20h14M6.5 10.5v7M10 10.5v7M14 10.5v7M17.5 10.5v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/** radio-group keyboard model: arrows wrap, Home/End jump; -1 for any other key */
function radioStep(key: string, i: number, n: number) {
  if (key === "ArrowRight" || key === "ArrowDown") return (i + 1) % n;
  if (key === "ArrowLeft" || key === "ArrowUp") return (i - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return -1;
}

const sq = (n: number) => ({ width: n, height: n, flexShrink: 0 });

/* mini-UI type: never below 13px, reaching the comp's sizes on wide screens */
const MINI = "clamp(0.8125rem, 0.76rem + 0.22vw, 1.0625rem)";
const MINI_S = "clamp(0.8125rem, 0.78rem + 0.12vw, 0.9375rem)";

export function Bento({ t, lang }: { t: Dictionary; lang: Locale }) {
  const b = t.bento;
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState(1);
  const [undone, setUndone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const regions = new Intl.DisplayNames([numberLocale[lang]], { type: "region" });
  const issued = new Intl.DateTimeFormat(numberLocale[lang], { dateStyle: "medium", timeZone: "UTC" }).format(ISSUED);

  return (
    <section id="boxes" aria-labelledby="bento-title" className="w-full bg-blush" style={{ paddingBlock: "calc(var(--section-y) * 0.6) var(--section-y)" }}>
      <div className="wrap">
        <h2
          id="bento-title"
          className="font-display text-night [text-wrap:balance]"
          style={{ fontSize: "var(--fs-h2)", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.045em" }}
        >
          {b.title}
        </h2>

        <div
          className="mt-[clamp(24px,2.4vw,40px)] grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4 lg:[grid-template-areas:'cert_pause_pause_receipt''cert_taxes_taxes_private''mirror_mirror_guar_guar'] lg:[grid-template-columns:502fr_356fr_90fr_476fr]"
        >
          {/* salary certificate */}
          <Card area={AREA.cert} dark fill title={b.cert.title} body={b.cert.body}>
            <div className="flex flex-col gap-5 rounded-2xl bg-blush p-[clamp(18px,1.7vw,26px)] text-night transition-transform duration-500 ease-out group-hover:-rotate-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2.5 font-display" style={{ fontSize: "clamp(1.0625rem, 0.95rem + 0.4vw, 1.4375rem)", fontWeight: 800, letterSpacing: "-0.02em" }}>
                  <span style={sq(32)}>
                    <StruckS className="block h-full w-full text-hibiscus" />
                  </span>
                  Strickle
                </span>
                <span className="flex items-center gap-1.5 rounded-[10px] bg-calyx-tint px-3 py-1.5 text-calyx" style={{ fontSize: MINI_S, fontWeight: 600 }}>
                  <span style={sq(16)}>{Icon.check}</span>
                  {b.cert.verified}
                </span>
              </div>
              <div>
              <p style={{ fontSize: "clamp(1.0625rem, 0.95rem + 0.4vw, 1.4375rem)", fontWeight: 700, lineHeight: 1.1 }}>
                {b.cert.doc}
              </p>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5" style={{ fontSize: MINI }}>
                <dt className="text-clay">{b.cert.issued}</dt>
                <dd className="text-right font-mono">{issued}</dd>
                <dt className="text-clay">{b.cert.country}</dt>
                <dd className="text-right font-mono">{regions.of("BR")}</dd>
                <dt className="text-clay">{b.cert.claim}</dt>
                <dd className="text-right font-mono tabular">≥ {money(2000, lang)}</dd>
                <dt className="text-clay" />
                <dd className="text-right font-mono">{b.cert.months}</dd>
              </dl>
              </div>
              <div>
              <div aria-hidden className="h-[1.5px] bg-line" />
              <p className="mt-4 flex items-center justify-between gap-3 rounded-[10px] bg-husk px-4 py-3 font-mono" style={{ fontSize: MINI_S }}>
                <span className="text-clay">{b.cert.proof}</span>
                <span>0x4f2a…9c7e</span>
              </p>
              </div>
            </div>
          </Card>

          {/* pause + autonomy */}
          <Card area={AREA.pause} title={b.pause.title} body={b.pause.body}>
            <button
              type="button"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
              className={`flex h-[clamp(60px,4.6vw,76px)] w-full items-center gap-4 rounded-full px-2 transition-colors duration-200 ${
                paused ? "bg-night text-blush" : "bg-hibiscus text-blush hover:bg-hibiscus-deep"
              }`}
              style={{ fontSize: "clamp(1rem, 5.4cqi, 1.4375rem)", fontWeight: 600 }}
            >
              <span className="flex aspect-square h-[calc(100%-16px)] items-center justify-center rounded-full bg-blush text-night">
                {paused ? (
                  <svg aria-hidden viewBox="0 0 24 24" style={sq(20)}>
                    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg aria-hidden viewBox="0 0 24 24" style={sq(20)}>
                    <path d="M8 5v14M16 5v14" stroke="var(--hibiscus)" strokeWidth="3.2" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <span className="flex-1 whitespace-nowrap text-center @min-[340px]:pr-[clamp(44px,3vw,56px)]">{paused ? b.pause.resume : b.pause.pause}</span>
            </button>
            <p aria-live="polite" className="mt-1.5 min-h-5 text-center text-clay" style={{ fontSize: MINI_S }}>
              {paused ? b.pause.paused : ""}
            </p>
            <div role="radiogroup" aria-label={b.pause.autonomy} className="relative mt-1">
              <div aria-hidden className="absolute top-[21px] h-[3px] bg-husk" style={{ left: "16.66%", right: "16.66%" }}>
                <div className="h-full bg-hibiscus transition-[width] duration-300" style={{ width: `${level * 50}%` }} />
              </div>
              <div className="relative grid grid-cols-3">
                {b.pause.levels.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={level === i}
                    tabIndex={level === i ? 0 : -1}
                    onClick={() => setLevel(i)}
                    onKeyDown={(e) => {
                      const j = radioStep(e.key, i, b.pause.levels.length);
                      if (j < 0) return;
                      e.preventDefault();
                      setLevel(j);
                      (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
                    }}
                    className="flex min-h-11 flex-col items-center gap-1.5 pt-1"
                    style={{ fontSize: MINI, fontWeight: level === i ? 700 : 500 }}
                  >
                    <span
                      aria-hidden
                      className={`flex size-8 items-center justify-center rounded-full transition-colors duration-200 ${
                        i <= level ? "bg-hibiscus text-blush" : "border-2 border-line bg-card text-clay"
                      }`}
                      style={{ fontSize: 14 }}
                    >
                      {i < level ? <span style={sq(15)}>{Icon.check}</span> : <span className="font-mono">{i + 1}</span>}
                    </span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* receipt with undo */}
          <Card area={AREA.receipt} title={b.receipt.title} body={b.receipt.body}>
            <div className="rounded-[14px] border-[1.5px] border-dashed border-line bg-blush px-[clamp(16px,1.4vw,22px)] py-[clamp(14px,1.3vw,20px)]">
              <div className="flex items-center gap-3">
                <span style={sq(30)}>
                  <StruckS className="block h-full w-full text-hibiscus" />
                </span>
                <span className="font-mono" style={{ fontSize: MINI, lineHeight: 1.25 }}>
                  {t.simulator.receipt}
                  <br />
                  <span className="text-clay" style={{ fontSize: MINI_S }}>
                    {issued}
                  </span>
                </span>
              </div>
              <div aria-hidden className="mt-3 h-[1.5px] bg-line" />
              <div className="mt-3 flex flex-col items-start gap-2 @min-[18rem]:flex-row @min-[18rem]:items-center @min-[18rem]:justify-between @min-[18rem]:gap-3">
                <p aria-live="polite" className="font-mono" style={{ fontSize: MINI, lineHeight: 1.35 }}>
                  {undone ? (
                    <span className="text-calyx">{b.receipt.undone}</span>
                  ) : (
                    <>
                      <span style={{ fontWeight: 500 }}>{b.receipt.line.replace("{amount}", money(300, lang))}</span>
                      <br />
                      <span className="text-clay">{b.receipt.rule}</span>
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setUndone((v) => !v)}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-4 text-hibiscus transition-colors duration-150 hover:bg-hibiscus hover:text-blush"
                  style={{ fontSize: MINI, fontWeight: 700, background: undone ? "transparent" : "color-mix(in oklab, var(--hibiscus) 10%, var(--blush))" }}
                >
                  {undone ? (
                    <svg aria-label={b.receipt.undo} viewBox="0 0 24 24" fill="none" style={sq(18)}>
                      <path d="M4 10h11a5 5 0 0 1 0 10h-3M4 10l4-4M4 10l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    b.receipt.undo
                  )}
                </button>
              </div>
            </div>
          </Card>

          {/* taxes by country */}
          <Card area={AREA.taxes} title={b.taxes.title} body={b.taxes.body}>
            <div className="rounded-[14px] border-[1.5px] border-line bg-blush px-[clamp(16px,1.3vw,20px)] py-4">
              <div className="flex flex-wrap items-center justify-between gap-2" style={{ fontSize: MINI }}>
                <span style={{ fontWeight: 700 }}>{regions.of("MX")}</span>
                <span className="flex items-center gap-2">
                  <span style={sq(17)}>{Icon.calendar}</span>
                  {b.taxes.due}
                </span>
              </div>
              <p className="mt-2.5 font-mono tabular" style={{ fontSize: "clamp(1.375rem, 1.2rem + 0.4vw, 1.625rem)", lineHeight: 1 }}>
                {money(3120, lang)}{" "}
                <span className="text-clay" style={{ fontSize: MINI_S }}>
                  {b.taxes.reserved}
                </span>
              </p>
              <p className="mt-3 flex items-center gap-2 text-amber" style={{ fontSize: MINI_S, fontWeight: 500 }}>
                <span style={sq(15)}>{Icon.warn}</span>
                {b.taxes.warn}
              </p>
            </div>
          </Card>

          {/* private boxes */}
          <Card area={AREA.private} title={b.private.title} body={b.private.body}>
            <button
              type="button"
              aria-pressed={revealed}
              onClick={() => setRevealed((v) => !v)}
              className="group/rows block w-full overflow-hidden rounded-[14px] border-[1.5px] border-line bg-blush text-left"
              title={b.private.reveal}
            >
              {b.private.rows.map((row, i) => (
                <span
                  key={row}
                  className={`flex min-h-12 items-center justify-between px-4 ${i ? "border-t-[1.5px] border-line" : ""}`}
                  style={{ fontSize: MINI, fontWeight: 500 }}
                >
                  {row}
                  <span className="flex items-center gap-3">
                    {/* balances are only part of the button's name once revealed */}
                    <span
                      aria-hidden={!revealed}
                      className={`font-mono tabular transition-[filter] duration-300 ${
                        revealed ? "" : "blur-[5px] group-hover/rows:blur-none group-focus-visible/rows:blur-none"
                      }`}
                    >
                      {money([3120, 2410, 860][i], lang)}
                    </span>
                    <span className="text-clay" style={sq(19)}>
                      {Icon.lock}
                    </span>
                  </span>
                </span>
              ))}
            </button>
          </Card>

          {/* mirror mode: side by side when the card is wide, stacked when narrow */}
          <Card area={AREA.mirror} title={b.mirror.title} body={b.mirror.body}>
            <div className="flex flex-col items-stretch gap-3 @min-[500px]:flex-row @min-[500px]:items-center">
              <div className="flex min-h-[clamp(96px,8vw,122px)] flex-1 items-center gap-3 rounded-[14px] border-[1.5px] border-line bg-blush px-4 py-4 @min-[640px]:gap-4 @min-[640px]:px-5">
                <span style={sq(28)}>{Icon.bank}</span>
                <span>
                  <span className="block" style={{ fontSize: MINI, fontWeight: 600 }}>
                    {b.mirror.bank}
                  </span>
                  <span className="mt-1 block whitespace-nowrap font-mono tabular" style={{ fontSize: "clamp(1.25rem, 4.6cqi, 1.875rem)", lineHeight: 1.1 }}>
                    {money(12480, lang)}
                  </span>
                </span>
              </div>
              <span
                className="flex h-11 items-center justify-center gap-2 self-center rounded-full border-[1.5px] border-line bg-card px-4 text-night"
                style={{ fontSize: MINI, fontWeight: 600 }}
              >
                {b.mirror.plans}
                <span className="rotate-90 transition-transform duration-300 @min-[500px]:rotate-0 @min-[500px]:group-hover:translate-x-1" style={sq(17)}>
                  {Icon.arrow}
                </span>
              </span>
              <div
                className="flex min-h-[clamp(96px,8vw,122px)] flex-1 flex-col justify-center rounded-[14px] px-4 py-4 @min-[640px]:px-5"
                style={{
                  background: "color-mix(in oklab, var(--hibiscus) 8%, var(--blush))",
                  border: "1.5px solid color-mix(in oklab, var(--hibiscus) 18%, var(--line))",
                }}
              >
                <span className="flex items-center gap-2.5" style={{ fontSize: MINI, fontWeight: 600 }}>
                  <span style={sq(24)}>
                    <StruckS className="block h-full w-full text-hibiscus" />
                  </span>
                  {b.mirror.plan}
                </span>
                <span className="mt-1 block whitespace-nowrap font-mono tabular" style={{ fontSize: "clamp(1.25rem, 4cqi, 1.625rem)", lineHeight: 1.1 }}>
                  {money(12480, lang)}
                </span>
                <span aria-hidden className="mt-2 flex h-2.5 gap-[3px] overflow-hidden rounded-full">
                  <span className="bg-hibiscus" style={{ flex: 20 }} />
                  <span className="bg-marigold" style={{ flex: 15 }} />
                  <span className="bg-night" style={{ flex: 55 }} />
                  <span className="bg-calyx" style={{ flex: 10 }} />
                </span>
              </div>
            </div>
          </Card>

          {/* guarantee */}
          <Card id="guarantee" area={AREA.guarantee} dark title={b.guarantee.title} body={b.guarantee.body}>
            <div
              className="flex min-h-[clamp(96px,8vw,112px)] flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[14px] px-[clamp(16px,1.6vw,24px)] py-4"
              style={{ border: "1.5px solid color-mix(in oklab, var(--blush) 22%, transparent)" }}
            >
              <span>
                <span className="block text-blush/75" style={{ fontSize: MINI_S }}>
                  {b.guarantee.cap}
                </span>
                <span className="mt-1.5 block font-mono tabular" style={{ fontSize: "clamp(2rem, 1.6rem + 1vw, 2.5rem)", lineHeight: 1 }}>
                  {money(500, lang)}
                </span>
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-calyx px-4 py-3 text-blush" style={{ fontSize: MINI_S, fontWeight: 600 }}>
                <span style={sq(17)}>{Icon.check}</span>
                {b.guarantee.fund}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
