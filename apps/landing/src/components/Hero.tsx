import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { locales } from "@/i18n/config";
import { APP_URL, at, canvas, fu, money, u, type Box } from "@/lib/design";
import { StruckS } from "./StruckS";
import { HeroMotion } from "./HeroMotion";

const LANG_LABEL: Record<Locale, string> = { en: "EN", es: "ES", "pt-br": "PT" };
const LANG_NAME: Record<Locale, string> = { en: "English", es: "Español", "pt-br": "Português" };

/* The mechanism is drawn twice, as container-scaled drawings: a wide one (frame 850x730,
   cut from the approved 1536 comp at x 660, y 180) and a narrow one (frame 390x524, cut
   from the 390 phone comp at y 396) with the boxes in a 3+2 grid. */
const WIDE = { x: 660, y: 180, w: 850, h: 730 };
const NARROW = { x: 0, y: 396, w: 390, h: 524 };
const shift = (o: { x: number; y: number }) => (b: Box): Box => ({ ...b, x: b.x - o.x, y: b.y - o.y });
const W = shift(WIDE);
const N = shift(NARROW);

function Tile({
  box,
  rotate,
  tone,
  label,
  size,
  radius = 18,
  part = "heap",
}: {
  part?: "heap" | "spill";
  box: Box;
  rotate: number;
  tone: "hibiscus" | "night";
  label: string;
  size: number;
  radius?: number;
}) {
  return (
    <div
      data-h={part}
      className={`flex items-center justify-center whitespace-nowrap font-mono tabular ${
        tone === "hibiscus" ? "bg-hibiscus text-blush" : "bg-night text-blush"
      }`}
      style={at(box, {
        transform: `rotate(${rotate}deg)`,
        borderRadius: u(radius),
        border: tone === "hibiscus" ? `${u(2.5)} solid var(--blush)` : undefined,
        fontSize: fu(size, 12),
        letterSpacing: "0.01em",
        boxShadow: `0 ${u(10)} ${u(24)} rgba(34, 20, 26, 0.16)`,
      })}
    >
      {label}
    </div>
  );
}

function Cell({
  box,
  label,
  amount,
  fill,
  narrow,
}: {
  box: Box;
  label: string;
  amount: string;
  fill: number;
  narrow?: boolean;
}) {
  const s = narrow
    ? { pad: 12, border: 1.2, radius: 10, label: 13, gap: 9, track: 7, amount: 14 }
    : { pad: 14, border: 1.5, radius: 6, label: 19, gap: 16, track: 16, amount: 20 };
  return (
    <div
      data-h="box"
      className="bg-card"
      style={at(box, {
        border: `${u(s.border)} solid var(--line)`,
        borderRadius: u(s.radius),
        padding: `${u(narrow ? 12 : 26)} ${u(s.pad)} 0`,
      })}
    >
      <p className="whitespace-nowrap" style={{ fontSize: fu(s.label, 12), lineHeight: 1.1, fontWeight: narrow ? 600 : 500 }}>
        {label}
      </p>
      <div aria-hidden style={{ marginTop: u(s.gap), height: u(s.track), borderRadius: u(8), background: "var(--husk)", overflow: "hidden" }}>
        <div data-h="fill" style={{ width: `${fill}%`, height: "100%", borderRadius: u(8), background: "var(--marigold)" }} />
      </div>
      <p className="font-mono tabular whitespace-nowrap" style={{ marginTop: u(narrow ? 9 : 14), fontSize: fu(s.amount, 12), lineHeight: 1 }}>
        {amount}
      </p>
    </div>
  );
}

function Arc({ box, d }: { box: Box; d: string }) {
  return (
    <svg data-h="arc" viewBox={`0 0 ${box.w} ${box.h}`} style={at(box)} fill="none">
      <path d={d} stroke="var(--night)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Chip({ box, label, size, narrow }: { box: Box; label: string; size: number; narrow?: boolean }) {
  return (
    <p
      data-h="chip"
      className={`flex items-center font-mono tabular text-calyx bg-calyx-tint ${narrow ? "justify-center" : ""}`}
      style={at(box, {
        width: narrow ? u(box.w) : "auto",
        borderRadius: u(narrow ? 12 : 14),
        padding: `0 ${u(narrow ? 16 : 26)}`,
        fontSize: fu(size, 13),
        gap: u(12),
        whiteSpace: "nowrap",
        letterSpacing: "-0.01em",
      })}
    >
      <span>{label}</span>
      <svg aria-hidden viewBox="0 0 24 24" style={{ width: fu(narrow ? 18 : 24, 15), height: fu(narrow ? 18 : 24, 15) }} fill="none">
        <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </p>
  );
}

const measure = (box: Box, border: number, radius: number): CSSProperties =>
  at(box, {
    border: `${u(border)} solid var(--night)`,
    borderTop: "none",
    borderRadius: `0 0 ${u(radius)} ${u(radius)}`,
    background: "linear-gradient(to bottom, var(--blush) 0%, var(--blush) 30%, var(--husk) 30%)",
  });

function WideMechanism({ t, lang }: { t: Dictionary; lang: Locale }) {
  const h = t.hero;
  return (
    <div className="drawing">
      <div className="canvas" style={canvas(WIDE.w, WIDE.h)}>
        <div data-h="back" className="bg-night" style={at(W({ x: 825, y: 332, w: 120, h: 80 }), { borderRadius: u(12), transform: "rotate(-6deg)" })} />
        <div data-h="back" className="bg-night" style={at(W({ x: 1128, y: 366, w: 66, h: 44 }), { borderRadius: u(10), transform: "rotate(8deg)" })} />
        <Tile box={W({ x: 838, y: 200, w: 214, h: 106 })} rotate={-14} tone="hibiscus" label={money(4000, lang, true)} size={28} />
        <Tile box={W({ x: 1062, y: 244, w: 176, h: 100 })} rotate={17} tone="night" label={money(900, lang, true)} size={28} />
        <Tile box={W({ x: 896, y: 300, w: 228, h: 108 })} rotate={6} tone="hibiscus" label={money(2350, lang, true)} size={28} />

        <div style={measure(W({ x: 811, y: 430, w: 434, h: 136 }), 3, 34)} />
        <div data-h="bar" className="bg-night" style={at(W({ x: 772, y: 400, w: 512, h: 32 }), { borderRadius: u(3) })} />

        <Arc box={W({ x: 1252, y: 312, w: 60, h: 52 })} d="M4 6 C 26 12, 44 26, 54 46" />
        <Arc box={W({ x: 1262, y: 340, w: 40, h: 40 })} d="M4 4 C 18 12, 28 24, 34 36" />
        <Arc box={W({ x: 1300, y: 425, w: 40, h: 44 })} d="M4 4 C 18 12, 28 26, 34 40" />
        <Arc box={W({ x: 1286, y: 433, w: 36, h: 34 })} d="M4 4 C 16 10, 24 20, 30 30" />
        <Tile box={W({ x: 1306, y: 368, w: 122, h: 60 })} rotate={22} tone="night" label={money(650, lang, true)} size={19} part="spill" />
        <Tile box={W({ x: 1330, y: 462, w: 122, h: 58 })} rotate={-8} tone="hibiscus" label={money(420, lang, true)} size={19} part="spill" />
        <Tile box={W({ x: 1388, y: 528, w: 112, h: 56 })} rotate={18} tone="night" label={money(310, lang, true)} size={19} part="spill" />
        <svg data-h="arc" viewBox="0 0 40 50" style={at(W({ x: 1346, y: 540, w: 34, h: 50 }))} fill="none">
          <path d="M6 4 L 22 42 M22 42 L 10 34 M22 42 L 26 28" stroke="var(--night)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <svg data-h="pipes" viewBox={`${WIDE.x} ${WIDE.y} ${WIDE.w} ${WIDE.h}`} style={at({ x: 0, y: 0, w: WIDE.w, h: WIDE.h })} fill="none">
          <g stroke="var(--marigold)" strokeWidth="2" strokeLinecap="round">
            <path d="M917 566 V594 Q917 610 901 610 H750 Q734 610 734 626 V664" />
            <path d="M1027 566 V590 Q1027 626 1011 626 H911 Q895 626 895 642 V664" />
            <path d="M1027 566 V590 Q1027 626 1043 626 H1041 Q1057 626 1057 642 V664" />
            <path d="M1027 566 V590 Q1027 626 1043 626 H1201 Q1217 626 1217 642 V664" />
            <path d="M1138 566 V594 Q1138 610 1154 610 H1370 Q1386 610 1386 626 V664" />
          </g>
        </svg>

        <Cell box={W({ x: 671, y: 664, w: 143, h: 137 })} label={h.boxes.taxes} amount={money(640, lang)} fill={68} />
        <Cell box={W({ x: 827, y: 664, w: 146, h: 137 })} label={h.boxes.operating} amount={money(480, lang)} fill={45} />
        <Cell box={W({ x: 987, y: 664, w: 151, h: 137 })} label={h.boxes.emergency} amount={money(420, lang)} fill={40} />
        <Cell box={W({ x: 1153, y: 664, w: 163, h: 137 })} label={h.boxes.salary} amount={money(1800, lang)} fill={68} />
        <Cell box={W({ x: 1330, y: 664, w: 145, h: 137 })} label={h.boxes.profit} amount={money(310, lang)} fill={30} />

        <Chip box={W({ x: 870, y: 840, w: 405, h: 60 })} label={`${h.chip}${money(1800, lang)}`} size={21} />
      </div>
    </div>
  );
}

function NarrowMechanism({ t, lang }: { t: Dictionary; lang: Locale }) {
  const h = t.hero;
  return (
    <div className="drawing">
      <div className="canvas" style={canvas(NARROW.w, NARROW.h)}>
        <div data-h="back" className="bg-night" style={at(N({ x: 62, y: 482, w: 70, h: 46 }), { borderRadius: u(8), transform: "rotate(-6deg)" })} />
        <div data-h="back" className="bg-night" style={at(N({ x: 228, y: 494, w: 40, h: 28 }), { borderRadius: u(6), transform: "rotate(8deg)" })} />
        <Tile box={N({ x: 44, y: 404, w: 150, h: 74 })} rotate={-14} tone="hibiscus" label={money(4000, lang, true)} size={20} radius={14} />
        <Tile box={N({ x: 184, y: 428, w: 118, h: 66 })} rotate={17} tone="night" label={money(900, lang, true)} size={19} radius={14} />
        <Tile box={N({ x: 82, y: 462, w: 160, h: 74 })} rotate={6} tone="hibiscus" label={money(2350, lang, true)} size={20} radius={14} />

        <div style={measure(N({ x: 34, y: 560, w: 236, h: 84 }), 2.5, 22)} />
        <div data-h="bar" className="bg-night" style={at(N({ x: 12, y: 538, w: 288, h: 22 }), { borderRadius: u(2) })} />

        <Tile box={N({ x: 290, y: 498, w: 82, h: 38 })} rotate={22} tone="night" label={money(650, lang, true)} size={12} radius={12} part="spill" />
        <Tile box={N({ x: 296, y: 556, w: 82, h: 36 })} rotate={-8} tone="hibiscus" label={money(420, lang, true)} size={12} radius={12} part="spill" />
        <Tile box={N({ x: 300, y: 610, w: 76, h: 34 })} rotate={18} tone="night" label={money(310, lang, true)} size={12} radius={12} part="spill" />

        <svg data-h="pipes" viewBox={`${NARROW.x} ${NARROW.y} ${NARROW.w} ${NARROW.h}`} style={at({ x: 0, y: 0, w: NARROW.w, h: NARROW.h })} fill="none">
          <g stroke="var(--marigold)" strokeWidth="1.6" strokeLinecap="round">
            <path d="M100 644 V660 Q100 668 92 668 H81 Q73 668 73 676 V690" />
            <path d="M152 644 V660 Q152 668 160 668 H187 Q195 668 195 676 V690" />
            <path d="M204 644 V660 Q204 668 212 668 H309 Q317 668 317 676 V690" />
          </g>
        </svg>

        <Cell narrow box={N({ x: 16, y: 690, w: 114, h: 76 })} label={h.boxes.taxes} amount={money(640, lang)} fill={68} />
        <Cell narrow box={N({ x: 138, y: 690, w: 114, h: 76 })} label={h.boxes.operating} amount={money(480, lang)} fill={45} />
        <Cell narrow box={N({ x: 260, y: 690, w: 114, h: 76 })} label={h.boxes.emergency} amount={money(420, lang)} fill={40} />
        <Cell narrow box={N({ x: 16, y: 774, w: 236, h: 76 })} label={h.boxes.salary} amount={money(1800, lang)} fill={68} />
        <Cell narrow box={N({ x: 260, y: 774, w: 114, h: 76 })} label={h.boxes.profit} amount={money(310, lang)} fill={30} />

        <Chip narrow box={N({ x: 16, y: 866, w: 358, h: 50 })} label={`${h.chip}${money(1800, lang)}`} size={15} />
      </div>
    </div>
  );
}

const arrow = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" fill="none">
    <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Hero({ t, lang }: { t: Dictionary; lang: Locale }) {
  const h = t.hero;
  return (
    <header data-hero className="relative flex w-full flex-col overflow-hidden bg-blush min-[64rem]:min-h-[min(100svh,1040px)]">
      <nav aria-label="Primary" className="wrap relative z-10 flex items-center gap-2 min-[24rem]:gap-3 py-4 min-[75rem]:py-8">
        <a href={`/${lang}`} className="flex min-h-11 items-center gap-2 text-night min-[24rem]:gap-2.5 min-[75rem]:gap-4">
          <span className="block size-6 min-[24rem]:size-8 min-[75rem]:size-12">
            <StruckS className="block h-full w-full text-hibiscus" title="Strickle" />
          </span>
          <span
            aria-hidden
            className="font-display text-[1.3125rem] min-[24rem]:text-[1.625rem] min-[75rem]:text-[2.375rem]"
            style={{ fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            Strickle
          </span>
        </a>
        <ul className="mx-auto hidden items-center gap-[clamp(20px,2.6vw,44px)] min-[56.25rem]:flex" style={{ fontSize: "var(--fs-body)", fontWeight: 500 }}>
          <li><a href="#how" className="flex min-h-11 items-center transition-colors duration-150 hover:text-hibiscus">{t.nav.how}</a></li>
          <li><a href="#boxes" className="flex min-h-11 items-center transition-colors duration-150 hover:text-hibiscus">{t.nav.boxes}</a></li>
          <li><a href="#salary" className="flex min-h-11 items-center transition-colors duration-150 hover:text-hibiscus">{t.nav.salary}</a></li>
          <li><a href="#guarantee" className="flex min-h-11 items-center transition-colors duration-150 hover:text-hibiscus">{t.nav.security}</a></li>
        </ul>
        <div className="ml-auto flex items-center gap-1 min-[24rem]:gap-2 min-[56.25rem]:ml-0 min-[56.25rem]:gap-[clamp(12px,2.4vw,40px)]">
          <details className="group relative">
            <summary
              aria-label={t.nav.language}
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1 min-[24rem]:gap-2 min-[24rem]:px-1 [&::-webkit-details-marker]:hidden"
              style={{ fontSize: "var(--fs-body)", fontWeight: 500 }}
            >
              {LANG_LABEL[lang]}
              <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 transition-transform duration-200 group-open:rotate-180" fill="none">
                <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <ul className="absolute right-0 top-full z-20 mt-2 w-40 rounded-[14px] border-[1.5px] border-line bg-card p-2 shadow-[0_14px_30px_rgba(34,20,26,0.12)]">
              {locales.map((l) => (
                <li key={l}>
                  <a
                    href={`/${l}`}
                    hrefLang={l}
                    aria-current={l === lang ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-lg px-3.5 transition-colors hover:bg-husk ${l === lang ? "text-hibiscus" : ""}`}
                    style={{ fontSize: "var(--fs-body)", fontWeight: l === lang ? 700 : 500 }}
                  >
                    {LANG_NAME[l]}
                  </a>
                </li>
              ))}
            </ul>
          </details>
          <a
            href={APP_URL}
            className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-hibiscus px-3 text-blush min-[24rem]:px-4 transition-colors duration-150 hover:bg-hibiscus-deep min-[75rem]:min-h-15 min-[75rem]:rounded-2xl min-[75rem]:px-8"
            style={{ fontSize: "clamp(0.9375rem, 0.85rem + 0.35vw, 1.375rem)", fontWeight: 600 }}
          >
            {t.nav.cta}
          </a>
        </div>
      </nav>

      <div className="wrap grid flex-1 items-center gap-y-10 pt-[clamp(28px,5vw,56px)] pb-[clamp(40px,6vw,72px)] min-[64rem]:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] min-[64rem]:gap-x-[clamp(24px,3vw,56px)] min-[64rem]:py-[clamp(24px,3vw,56px)] min-[90rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[90rem]:gap-x-8">
        {/* copy: the headline sizes to its own column so both lines always fit */}
        <div className="[container-type:inline-size]">
          <h1
            className="font-display text-night"
            style={{ fontSize: "min(var(--fs-display), 13.8cqi)", fontWeight: 800, lineHeight: 0.96, letterSpacing: "-0.045em" }}
          >
            <span className="block whitespace-nowrap">{h.line1}</span>
            <span className="block whitespace-nowrap">{h.line2}</span>
          </h1>
          <p className="mt-[clamp(16px,2.2vw,34px)]" style={{ fontSize: "var(--fs-lead)", lineHeight: 1.38, letterSpacing: "-0.01em" }}>
            <span className="block">{h.support1}</span>
            <span className="block">{h.support2}</span>
          </p>
          <div className="mt-[clamp(24px,3.6vw,56px)] flex flex-col items-stretch gap-x-9 gap-y-4 min-[40rem]:flex-row min-[40rem]:items-center">
            <a
              href={APP_URL}
              className="group flex min-h-14 items-center justify-center gap-3.5 rounded-2xl bg-hibiscus px-8 text-blush transition-colors duration-150 hover:bg-hibiscus-deep min-[75rem]:min-h-[4.75rem] min-[75rem]:rounded-[20px] min-[75rem]:px-10"
              style={{ fontSize: "clamp(1.0625rem, 0.95rem + 0.45vw, 1.5rem)", fontWeight: 600 }}
            >
              {h.cta}
              {arrow}
            </a>
            <a
              href="#how"
              className="flex min-h-11 items-center self-center text-night underline transition-colors duration-150 hover:text-hibiscus min-[40rem]:self-auto"
              style={{
                fontSize: "clamp(0.9375rem, 0.88rem + 0.25vw, 1.25rem)",
                fontWeight: 500,
                textUnderlineOffset: "0.55em",
                textDecorationThickness: "1.25px",
                textDecorationColor: "color-mix(in oklab, var(--hibiscus) 45%, var(--night))",
              }}
            >
              {h.secondary}
            </a>
          </div>
        </div>

        {/* mechanism: payments heaped over the measure, struck level, excess into the boxes */}
        <div aria-hidden className="w-full">
          <div className="mx-auto hidden max-w-[820px] min-[40rem]:block min-[64rem]:max-w-none">
            <WideMechanism t={t} lang={lang} />
          </div>
          <div className="mx-[calc(-1*var(--gutter))] min-[40rem]:hidden">
            <div className="mx-auto max-w-[520px]">
              <NarrowMechanism t={t} lang={lang} />
            </div>
          </div>
        </div>
      </div>
      <HeroMotion />
    </header>
  );
}
