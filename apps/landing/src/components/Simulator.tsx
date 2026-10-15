"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { numberLocale } from "@/i18n/config";
import { APP_URL, money } from "@/lib/design";
import { StruckS } from "./StruckS";

/*
 * Illustrative effective-rate estimates for a freelancer's foreign income.
 * The product's tax engine replaces this table; the landing only shows the mechanism.
 */
const TAX_RATES: Record<string, number> = { AR: 10, BR: 15, CO: 18, MX: 20, NG: 15, IN: 12, PH: 15, OTHER: 20 };
const DEFAULT_COUNTRY: Record<Locale, string> = { en: "MX", es: "MX", "pt-br": "BR" };
const GOALS = [2000, 1500, 2500];
/* the goal radios: three presets, then 0 for Custom */
const OPTIONS = [...GOALS, 0];

/** radio-group keyboard model: arrows wrap, Home/End jump; -1 for any other key */
function radioStep(key: string, i: number, n: number) {
  if (key === "ArrowRight" || key === "ArrowDown") return (i + 1) % n;
  if (key === "ArrowLeft" || key === "ArrowUp") return (i - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return -1;
}
const CUSHION_SHARE = 0.15;
const PAYDAY = Date.UTC(2026, 10, 1);

function level(amount: number, rate: number, goal: number) {
  const taxes = Math.round((amount * rate) / 100);
  const cushionTarget = Math.round((goal * 14) / 30);
  const cushion = Math.min(Math.round(amount * CUSHION_SHARE), cushionTarget, amount - taxes);
  const rest = amount - taxes - cushion;
  const salary = Math.min(goal, rest);
  return { taxes, cushion, salary, profit: rest - salary, pending: goal - salary };
}

/** eases a figure to its new value, like an odometer settling */
function useTween(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

function Figure({ value, lang }: { value: number; lang: Locale }) {
  return <>{money(useTween(value), lang)}</>;
}

function Zigzag({ flip }: { flip?: boolean }) {
  // a torn paper edge: 616 wide, teeth every 16
  const teeth = Array.from({ length: 39 }, (_, i) => `L${i * 16 + 8} 0 L${i * 16 + 16} 10`).join(" ");
  return (
    <svg
      aria-hidden
      viewBox="0 0 616 12"
      preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height: 12, transform: flip ? "scaleY(-1)" : undefined }}
    >
      <path d={`M0 12 L0 10 ${teeth} L616 12 Z`} fill="var(--card)" />
      <path d={`M0 10 ${teeth}`} fill="none" stroke="var(--line)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Simulator({ t, lang }: { t: Dictionary; lang: Locale }) {
  const s = t.simulator;
  const ids = { amount: useId(), country: useId(), goal: useId(), custom: useId() };
  const nf = useMemo(() => new Intl.NumberFormat(numberLocale[lang], { maximumFractionDigits: 0 }), [lang]);
  const regions = useMemo(() => new Intl.DisplayNames([numberLocale[lang]], { type: "region" }), [lang]);

  const [amount, setAmount] = useState(3200);
  const [draft, setDraft] = useState(() => nf.format(3200));
  const [country, setCountry] = useState(DEFAULT_COUNTRY[lang]);
  const [goal, setGoal] = useState(2000);
  const [custom, setCustom] = useState(false);
  const customInput = useRef<HTMLInputElement>(null);
  /* focus the custom amount only when Custom was clicked, never while arrowing through the radios */
  const focusCustom = useRef(false);
  const goalIndex = custom ? OPTIONS.length - 1 : OPTIONS.indexOf(goal);
  const pickGoal = (i: number) => {
    if (OPTIONS[i] === 0) setCustom(true);
    else {
      setCustom(false);
      setGoal(OPTIONS[i]);
    }
  };
  useEffect(() => {
    if (custom && focusCustom.current) customInput.current?.focus();
    focusCustom.current = false;
  }, [custom]);
  const [stamp, setStamp] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  const [live, setLive] = useState("");

  const rate = TAX_RATES[country];
  const countryName = country === "OTHER" ? s.other : (regions.of(country) ?? country);
  const r = level(amount, rate, goal);
  const fill = (template: string, values: Record<string, string>) =>
    template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

  // re-strike the receipt shortly after the inputs settle
  useEffect(() => {
    const id = setTimeout(() => setStamp((n) => n + 1), 180);
    return () => clearTimeout(id);
  }, [amount, country, goal]);

  const onAmount = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 7);
    const n = digits ? Number(digits) : 0;
    setAmount(n);
    setDraft(digits ? nf.format(n) : "");
  };

  const lines = [
    { key: "taxes", label: s.taxes, value: r.taxes, rule: fill(s.taxRule, { rate: String(rate), country: countryName }), why: s.whyTaxes },
    { key: "cushion", label: s.cushion, value: r.cushion, rule: s.cushionRule, why: s.whyCushion },
    {
      key: "salary",
      label: s.salary,
      value: r.salary,
      rule: r.pending > 0 ? fill(s.pendingRule, { amount: money(r.pending, lang) }) : s.salaryRule,
      warn: r.pending > 0,
      why: s.whySalary,
    },
    { key: "profit", label: s.profit, value: r.profit, rule: s.profitRule, why: s.whyProfit },
  ];
  const liveText = fill(s.live, {
    taxes: money(r.taxes, lang),
    cushion: money(r.cushion, lang),
    salary: money(r.salary, lang),
    profit: money(r.profit, lang),
  });
  useEffect(() => {
    if (stamp > 1) setLive(liveText);
    // announce only when the receipt re-strikes, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  const payday = new Intl.DateTimeFormat(numberLocale[lang], { month: "short", day: "numeric", timeZone: "UTC" }).format(PAYDAY);
  const appHref = `${APP_URL}/?amount=${amount}&country=${country}&goal=${goal}&lang=${lang}`;

  const labelCls = "block font-semibold leading-none";
  const labelStyle = { fontSize: "var(--fs-body)" } as const;
  const field = "border-[1.5px] border-line bg-blush rounded-[clamp(12px,0.6rem+0.3vw,14px)]";

  return (
    <section id="salary" aria-labelledby="sim-title" className="relative w-full bg-blush" style={{ paddingBlock: "var(--section-y)" }}>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      <div className="wrap grid grid-cols-[minmax(0,1fr)] gap-y-[clamp(20px,1rem+1.2vw,36px)] lg:grid-cols-[minmax(0,782fr)_minmax(0,616fr)] lg:gap-x-[clamp(28px,1rem+1.4vw,40px)]">
        <div className="lg:col-start-1 lg:row-start-1">
          <h2
            id="sim-title"
            className="font-display text-balance text-night"
            style={{ fontSize: "var(--fs-h2)", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.045em" }}
          >
            {s.title}
          </h2>
          <p style={{ marginTop: "clamp(10px, 0.4rem + 0.6vw, 18px)", fontSize: "var(--fs-lead)", lineHeight: 1.35, letterSpacing: "-0.01em" }}>
            {s.support}
          </p>
        </div>

        {/* the form */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-[clamp(18px,0.9rem+0.8vw,30px)] self-start rounded-[clamp(18px,1rem+0.25vw,20px)] border-[1.5px] border-line bg-card p-[clamp(16px,0.7rem+1.4vw,34px)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:col-start-1 lg:row-start-2 lg:grid-cols-[minmax(0,1fr)]"
        >
          <div className="md:col-span-2 lg:col-span-1">
            <label htmlFor={ids.amount} className={labelCls} style={labelStyle}>
              {s.income}
            </label>
            <div
              className={`${field} mt-3 flex items-center font-mono tabular focus-within:outline-2 focus-within:outline-hibiscus`}
              style={{
                height: "clamp(76px, 3.4rem + 4.4vw, 150px)",
                padding: "0 clamp(14px, 0.6rem + 1vw, 26px)",
                fontSize: "clamp(2.5rem, 1.6rem + 3.4vw, 5.25rem)",
                letterSpacing: "-0.02em",
              }}
            >
              <span aria-hidden>US$</span>
              <input
                id={ids.amount}
                inputMode="numeric"
                autoComplete="off"
                value={draft}
                onChange={(e) => onAmount(e.target.value)}
                className="min-w-0 flex-1 bg-transparent caret-hibiscus outline-none"
                style={{ fontSize: "inherit", letterSpacing: "inherit", outline: "none" }}
              />
            </div>
          </div>

          <div>
            <label htmlFor={ids.country} className={labelCls} style={labelStyle}>
              {s.country}
            </label>
            <div className="relative mt-3">
              <select
                id={ids.country}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={`${field} w-full cursor-pointer appearance-none text-night`}
                style={{ height: "clamp(52px, 2.6rem + 1vw, 66px)", padding: "0 52px 0 clamp(14px, 0.7rem + 0.5vw, 22px)", fontSize: "var(--fs-body)", fontWeight: 500 }}
              >
                {Object.keys(TAX_RATES).map((code) => (
                  <option key={code} value={code}>
                    {code === "OTHER" ? s.other : regions.of(code)}
                  </option>
                ))}
              </select>
              <svg aria-hidden viewBox="0 0 16 16" fill="none" className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2">
                <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div className="@container min-w-0">
            <p id={ids.goal} className={labelCls} style={labelStyle}>
              {s.goal}
            </p>
            <div
              role="radiogroup"
              aria-labelledby={ids.goal}
              className="mt-3 grid grid-cols-2 gap-[1.5px] overflow-hidden rounded-[clamp(12px,0.6rem+0.3vw,14px)] border-[1.5px] border-line bg-line @[26rem]:grid-cols-4"
            >
              {OPTIONS.map((g, i) => {
                const isCustom = g === 0;
                const on = i === goalIndex;
                return (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => {
                      if (isCustom && custom) customInput.current?.focus();
                      else if (isCustom) focusCustom.current = true;
                      pickGoal(i);
                    }}
                    onKeyDown={(e) => {
                      const j = radioStep(e.key, i, OPTIONS.length);
                      if (j < 0) return;
                      e.preventDefault();
                      pickGoal(j);
                      (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
                    }}
                    className={`whitespace-nowrap transition-colors duration-150 focus-visible:relative focus-visible:z-10 focus-visible:-outline-offset-4 ${isCustom ? "font-medium" : "font-mono tabular"} ${
                      on ? "bg-hibiscus text-blush focus-visible:outline-blush" : "bg-card hover:bg-husk"
                    }`}
                    style={{ minHeight: "clamp(48px, 2.5rem + 1vw, 68px)", fontSize: "clamp(0.875rem, 0.78rem + 0.4vw, 1.3125rem)" }}
                  >
                    {isCustom ? s.custom : money(g, lang)}
                  </button>
                );
              })}
            </div>
            {custom && (
              <label
                className={`${field} mt-3 flex items-center font-mono tabular focus-within:outline-2 focus-within:outline-hibiscus`}
                style={{ height: "clamp(48px, 2.5rem + 1vw, 60px)", padding: "0 16px", fontSize: "var(--fs-lead)", gap: 4 }}
              >
                <span className="sr-only">{s.custom}</span>
                <span aria-hidden>US$</span>
                <input
                  id={ids.custom}
                  ref={customInput}
                  inputMode="numeric"
                  value={nf.format(goal)}
                  onChange={(e) => setGoal(Number(e.target.value.replace(/\D/g, "").slice(0, 6)) || 0)}
                  className="min-w-0 flex-1 bg-transparent caret-hibiscus outline-none"
                  style={{ fontSize: "inherit", outline: "none" }}
                />
              </label>
            )}
          </div>

          <a
            href={appHref}
            className="group flex items-center justify-center bg-hibiscus text-blush transition-colors duration-150 hover:bg-hibiscus-deep active:bg-hibiscus-deep md:col-span-2 lg:col-span-1"
            style={{
              height: "clamp(54px, 2.6rem + 2vw, 82px)",
              borderRadius: "clamp(14px, 0.75rem + 0.2vw, 16px)",
              fontSize: "clamp(1.0625rem, 0.88rem + 0.75vw, 1.75rem)",
              fontWeight: 600,
              gap: "clamp(10px, 0.5rem + 0.5vw, 18px)",
            }}
          >
            {s.cta}
            <svg aria-hidden viewBox="0 0 24 24" className="size-[1em] transition-transform duration-200 group-hover:translate-x-1" fill="none">
              <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </form>

        {/* the receipt */}
        <div className="flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Zigzag />
          <div
            className="flex flex-1 flex-col border-x-[1.5px] border-line bg-card"
            style={{ padding: "clamp(22px, 1rem + 1.4vw, 44px) clamp(18px, 0.9rem + 0.9vw, 32px) clamp(18px, 1rem + 0.5vw, 26px)" }}
          >
            <div className="flex items-center" style={{ gap: "clamp(14px, 0.7rem + 0.6vw, 24px)" }}>
              <span className="shrink-0" style={{ width: "clamp(40px, 2rem + 1.4vw, 62px)", aspectRatio: "1" }}>
                <StruckS className="block h-full w-full text-hibiscus" />
              </span>
              <div>
                <p className="font-mono" style={{ fontSize: "clamp(1.0625rem, 0.9rem + 0.6vw, 1.625rem)", fontWeight: 500, lineHeight: 1 }}>
                  {s.receipt}
                </p>
                <p className="font-mono text-clay" style={{ marginTop: "clamp(8px, 0.4rem + 0.25vw, 12px)", fontSize: "clamp(0.8125rem, 0.74rem + 0.3vw, 1.0625rem)", lineHeight: 1 }}>
                  {payday} · {countryName}
                </p>
              </div>
            </div>

            <dl style={{ marginTop: "clamp(14px, 0.5rem + 2vw, 40px)" }}>
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="grid"
                  style={{ gridTemplateColumns: "1fr auto", columnGap: "clamp(12px, 0.5rem + 0.8vw, 24px)", padding: "clamp(12px, 0.5rem + 0.9vw, 22px) 0" }}
                >
                  <dt style={{ fontSize: "clamp(1.0625rem, 0.92rem + 0.55vw, 1.5625rem)", fontWeight: 600, lineHeight: 1.2 }}>{l.label}</dt>
                  <dd className="font-mono tabular text-right" style={{ fontSize: "clamp(1.125rem, 0.95rem + 0.7vw, 1.75rem)", lineHeight: 1.1 }}>
                    <Figure value={l.value} lang={lang} />
                  </dd>
                  <dd
                    key={`${l.key}-${stamp}`}
                    className={`settle col-span-2 flex items-center font-mono ${l.warn ? "text-amber" : "text-clay"}`}
                    style={{ marginTop: "clamp(6px, 0.3rem + 0.25vw, 10px)", fontSize: "clamp(0.8125rem, 0.72rem + 0.38vw, 1.1875rem)", lineHeight: 1.25, gap: 8 }}
                  >
                    {l.warn && (
                      <svg aria-hidden viewBox="0 0 16 16" className="size-[1em] shrink-0" fill="none">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M8 4.5v4M8 11v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    )}
                    <span className={why === l.key ? "text-night" : undefined}>{why === l.key ? l.why : l.rule}</span>
                    <button
                      type="button"
                      aria-expanded={why === l.key}
                      onClick={() => setWhy((w) => (w === l.key ? null : l.key))}
                      className="-my-3 -mr-2 ml-auto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 font-sans text-night underline decoration-line transition-colors hover:text-hibiscus"
                      style={{ textUnderlineOffset: "0.3em" }}
                    >
                      {why === l.key ? (
                        <svg aria-label={s.why} viewBox="0 0 16 16" fill="none" style={{ width: "0.9em", height: "0.9em" }}>
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      ) : (
                        s.why
                      )}
                    </button>
                  </dd>
                </div>
              ))}
            </dl>

            <div key={`strike-${stamp}`} aria-hidden className="strike-sweep bg-hibiscus" style={{ height: 3, borderRadius: 2, marginTop: 4 }} />

            <p
              className="flex items-center font-mono tabular text-calyx bg-calyx-tint"
              style={{
                marginTop: "clamp(18px, 0.8rem + 1.4vw, 38px)",
                minHeight: "clamp(50px, 2.6rem + 1.3vw, 70px)",
                borderRadius: 14,
                padding: "10px clamp(14px, 0.7rem + 0.8vw, 26px)",
                fontSize: "clamp(0.875rem, 0.76rem + 0.48vw, 1.375rem)",
                gap: "clamp(10px, 0.5rem + 0.4vw, 16px)",
              }}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-[1.1em] shrink-0" fill="none">
                <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                {s.salary} · {payday} · <Figure value={r.salary} lang={lang} />
              </span>
            </p>

            <p
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-[clamp(14px,0.8rem+1vw,32px)] font-mono text-clay lg:mt-auto"
              style={{ fontSize: "clamp(0.8125rem, 0.76rem + 0.2vw, 0.9375rem)" }}
            >
              {s.note}
              <a
                href={`${appHref}&edit=rules`}
                className="inline-flex min-h-11 items-center font-sans text-night underline transition-colors hover:text-hibiscus"
                style={{ fontSize: "var(--fs-small)", textUnderlineOffset: "0.3em" }}
              >
                {s.change}
              </a>
            </p>
          </div>
          <Zigzag flip />
        </div>
      </div>
    </section>
  );
}
