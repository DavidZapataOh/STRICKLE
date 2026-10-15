"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { numberLocale } from "@/i18n/config";
import { at, fu, money, u, type Box } from "@/lib/design";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ---- the example: six months, one salary line ---- */
const SALARY = 2080;
const TAXES = 3280;
const CUSHION_IN = 3480;
const CUSHION_OUT = 640;
const TAX_SHARE = TAXES / (TAXES + CUSHION_IN);
const PAYMENTS = [
  { month: 5, amount: 3800, client: "Halden Studio" },
  { month: 6, amount: 0, client: null },
  { month: 7, amount: 5900, client: "Northwind" },
  { month: 8, amount: 1400, client: "Okapi Labs" },
  { month: 9, amount: 3300, client: "Marlow & Co" },
  { month: 10, amount: 2000, client: "Tidewater" },
];

/* ---- the chart is a drawing: coordinates are drawing units, scaled to fit its own box (not the window) ---- */
type Drawing = {
  name: "desktop" | "mobile";
  w: number;
  h: number;
  base: number;
  k: number;
  barW: number;
  cx: (i: number) => number;
  /** amount floor in px; `prefix` false drops "US$" where six labels must share a phone's width */
  tag: { amount: number; amountMin: number; client: number; prefix: boolean };
  month: { font: number; min: number; dy: number };
  chip: { w: number; minW: number; h: number; font: number; min: number; dy: number; amount: boolean };
  line: { x: number; w: number; h: number };
  taxBox: Box;
  cushionBox: Box;
  box: { pad: number; label: number; amount: number; min: number; bar: number; gap: number; radius: number };
  caption: { dy: number; font: number } | null;
};

const DESKTOP: Drawing = {
  name: "desktop",
  w: 993,
  h: 752,
  base: 440,
  k: 0.06,
  barW: 72,
  cx: (i) => 117 + i * 158,
  tag: { amount: 22, amountMin: 13, client: 15, prefix: true },
  month: { font: 19, min: 13, dy: 16 },
  chip: { w: 132, minW: 88, h: 34, font: 16, min: 12, dy: 54, amount: true },
  line: { x: 27, w: 950, h: 4 },
  taxBox: { x: 30, y: 575, w: 440, h: 150 },
  cushionBox: { x: 502, y: 575, w: 456, h: 150 },
  box: { pad: 30, label: 23, amount: 24, min: 14, bar: 22, gap: 26, radius: 20 },
  caption: null,
};

const MOBILE: Drawing = {
  name: "mobile",
  w: 374,
  h: 432,
  base: 238,
  k: 0.034,
  barW: 34,
  cx: (i) => 42 + i * 58,
  tag: { amount: 12, amountMin: 12, client: 0, prefix: false },
  month: { font: 12, min: 12, dy: 8 },
  chip: { w: 40, minW: 0, h: 22, font: 12, min: 0, dy: 32, amount: false },
  line: { x: 14, w: 346, h: 3 },
  taxBox: { x: 16, y: 322, w: 165, h: 106 },
  cushionBox: { x: 193, y: 322, w: 165, h: 106 },
  box: { pad: 14, label: 15, amount: 16, min: 13, bar: 10, gap: 12, radius: 14 },
  caption: { dy: 62, font: 12 },
};

function bars(D: Drawing) {
  const lineY = D.base - SALARY * D.k;
  return PAYMENTS.map((m, i) => {
    const baseH = Math.min(m.amount, SALARY) * D.k;
    const excessH = Math.max(0, m.amount - SALARY) * D.k;
    const gapH = Math.max(0, SALARY - m.amount) * D.k;
    return { ...m, cx: D.cx(i), baseH, excessH, gapH, lineY, top: Math.min(D.base - baseH - excessH, lineY) };
  });
}
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 3 });

function monthName(month: number, lang: Locale) {
  const s = new Intl.DateTimeFormat(numberLocale[lang], { month: "short", timeZone: "UTC" })
    .format(Date.UTC(2026, month, 1))
    .replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Check({ size }: { size: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" style={{ width: size, height: size, flex: "none" }} fill="none">
      <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** builds the four-act timeline for one frame */
function buildTimeline(scope: HTMLElement, D: Drawing, lang: Locale) {
  const q = gsap.utils.selector(scope);
  const drawing = q("[data-canvas]")[0] as HTMLElement;
  const px = () => drawing.getBoundingClientRect().width / D.w;

  const acts = q("[data-act]");
  const labels = q("[data-act-label]");
  const taxAmount = q("[data-amount=taxes]")[0];
  const cushionAmount = q("[data-amount=cushion]")[0];
  const counter = { taxes: 0, cushion: 0 };
  const paint = () => {
    taxAmount.textContent = money(counter.taxes, lang);
    cushionAmount.textContent = money(counter.cushion, lang);
  };

  gsap.set([...acts.slice(1), ...labels.slice(1)], { autoAlpha: 0 });
  gsap.set([acts[0], labels[0]], { autoAlpha: 1 });
  gsap.set(q("[data-grow]"), { scaleY: 0, transformOrigin: "50% 100%" });
  gsap.set(q("[data-chunk]"), { autoAlpha: 1 });
  // "Next act" only exists with script; on the last act it points forward to the simulator
  gsap.set(q("[data-next]"), { autoAlpha: 1 });
  gsap.set(q("[data-next-label]"), { display: "inline" });
  gsap.set(q("[data-last-label]"), { display: "none" });
  gsap.set(q("[data-fill]"), { scaleY: 0, transformOrigin: "50% 100%" });
  gsap.set(q("[data-tag]"), { autoAlpha: 0 });
  gsap.set(q("[data-line]"), { scaleX: 0, transformOrigin: "0% 50%" });
  gsap.set(q("[data-gap]"), { autoAlpha: 0 });
  gsap.set(q("[data-chip]"), { autoAlpha: 0, y: 8 });
  gsap.set(q("[data-pill]"), { scaleX: 0, transformOrigin: "0% 50%" });
  gsap.set(q("[data-bar]"), { scaleX: 0, transformOrigin: "0% 50%" });
  paint();

  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  const swap = (n: number) => {
    const t0 = n - 0.1;
    tl.to([acts[n - 1], labels[n - 1]], { autoAlpha: 0, y: -14, duration: 0.12, ease: "power1.in" }, t0);
    tl.fromTo([acts[n], labels[n]], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.16 }, t0 + 0.1);
  };
  q("[data-pill]").forEach((pill, i) => tl.to(pill, { scaleX: 1, duration: 0.8, ease: "none" }, i));

  // act 1: the months arrive, uneven
  tl.to(q("[data-grow]"), { scaleY: 1, duration: 0.5, stagger: 0.06 }, 0);
  tl.to(q("[data-tag]"), { autoAlpha: 1, duration: 0.25, stagger: 0.06 }, 0.2);

  // act 2: the strike line sweeps; the excess turns hibiscus and is cut in two; short months show their gap
  swap(1);
  tl.to(q("[data-line]"), { scaleX: 1, duration: 0.45 }, 1);
  tl.to(q("[data-chunk]"), { backgroundColor: "#a3214f", duration: 0.2, stagger: 0.04 }, 1.2);
  tl.to(q("[data-gap]"), { autoAlpha: 1, duration: 0.25, stagger: 0.05 }, 1.3);
  tl.to(q("[data-chunk=taxes]"), { y: () => -6 * px(), duration: 0.3, stagger: 0.04 }, 1.45);
  tl.to(q("[data-chunk=cushion]"), { y: () => -14 * px(), duration: 0.3, stagger: 0.04 }, 1.45);

  // act 3: the excess falls into Taxes and Cushion
  swap(2);
  q("[data-chunk]").forEach((chunk, i) => {
    const el = chunk as HTMLElement;
    const target = center(el.dataset.chunk === "taxes" ? D.taxBox : D.cushionBox);
    const from = { x: Number(el.dataset.cx), y: Number(el.dataset.cy) };
    tl.to(
      el,
      {
        x: () => (target.x - from.x) * px(),
        y: () => (target.y - from.y) * px(),
        rotation: i % 2 ? 18 : -14,
        scale: 0.35,
        duration: 0.5,
        ease: "power2.in",
      },
      2 + i * 0.05,
    ).to(el, { autoAlpha: 0, duration: 0.08 }, ">-0.04");
  });
  tl.to(counter, { taxes: TAXES, cushion: CUSHION_IN, duration: 0.45, ease: "none", onUpdate: paint }, 2.35);
  tl.to(q("[data-bar=taxes]"), { scaleX: 0.82, duration: 0.45, ease: "none" }, 2.35);
  tl.to(q("[data-bar=cushion]"), { scaleX: 0.87, duration: 0.45, ease: "none" }, 2.35);
  tl.to(q("[data-box=cushion]"), { scale: 1.02, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.out" }, 2.66);

  // act 4: the cushion fills every short month to the line; the same salary lands
  swap(3);
  tl.to(q("[data-fill]"), { scaleY: 1, duration: 0.4, stagger: 0.08 }, 3);
  tl.to(counter, { cushion: CUSHION_OUT, duration: 0.5, ease: "none", onUpdate: paint }, 3);
  tl.to(q("[data-bar=cushion]"), { scaleX: 0.16, duration: 0.5, ease: "none" }, 3);
  tl.to(q("[data-gap]"), { autoAlpha: 0, duration: 0.2 }, 3.35);
  tl.to(q("[data-chip]"), { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.05 }, 3.4);
  tl.set(q("[data-next-label]"), { display: "none" }, 3);
  tl.set(q("[data-last-label]"), { display: "inline" }, 3);
  tl.to({}, { duration: 0.15 }, 3.85);
  return tl;
}

const SNAPS = [0, 0.85, 1.85, 2.85, 4];
/** the server HTML shows the resolved state (act 4) so a visitor without scripts reads one coherent frame */
const HIDDEN = { opacity: 0, visibility: "hidden" } as const;

/*
 * Layout, by content rather than device:
 *  - phones (< 640px wide) get the phone drawing, stacked: copy, chart, footer
 *  - wider and landscape-ish (aspect >= 6:5) get copy column | chart
 *  - wider and portrait (tablets upright) get the desktop drawing stacked under the copy
 * The card fits the viewport height (the section is pinned), capped in width and height.
 */
const CSS = `
.seq-frame { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: clamp(8px, 3svh, 40px) var(--gutter); }
.seq-frame[data-frame=desktop] { display: none; }
@media (min-width: 640px) {
  .seq-frame[data-frame=desktop] { display: flex; }
  .seq-frame[data-frame=mobile] { display: none; }
}
.seq-card { position: relative; width: 100%; max-width: var(--page-max); height: 100%; max-height: 880px;
  display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "copy" "chart" "foot";
  background: var(--card); border: 1.5px solid var(--line); border-radius: clamp(18px, 2vw, 28px); overflow: hidden; }
.seq-copy { grid-area: copy; container-type: inline-size; display: flex; flex-direction: column; padding: clamp(16px, 2.6vw, 40px) clamp(16px, 2.6vw, 40px) 0; }
.seq-foot { grid-area: foot; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 0 clamp(16px, 2.6vw, 40px) clamp(14px, 2.4vw, 36px); }
.seq-chart { grid-area: chart; position: relative; min-height: 0; container: chart / size;
  padding: clamp(10px, 2svh, 24px) clamp(12px, 2vw, 32px); }
.seq-grid { position: absolute; inset: 0; pointer-events: none;
  background-image: linear-gradient(to right, color-mix(in oklab, var(--line) 70%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in oklab, var(--line) 70%, transparent) 1px, transparent 1px);
  background-size: 24px 24px; mask-image: linear-gradient(to bottom, transparent, #000 14%); }
.seq-canvas { --u: min(100cqw / var(--dw), 100cqh / var(--dh)); position: absolute; inset: 0; margin: auto;
  width: calc(var(--u) * var(--dw)); height: calc(var(--u) * var(--dh)); }
@container chart (max-width: 560px) or (max-height: 440px) { .seq-client { display: none; } }

.seq-label { font-family: var(--font-geist-mono), ui-monospace, monospace; letter-spacing: 0.02em; line-height: 1.2;
  font-size: clamp(0.8125rem, 0.66rem + 0.45vw, 1.375rem); }
.seq-pills { display: flex; gap: clamp(6px, 0.8vw, 13px); width: min(100%, 360px); margin-top: 4px; }
.seq-pill { position: relative; flex: 1; height: 44px; cursor: pointer; }
.seq-pill-bar { position: absolute; left: 0; right: 0; top: 50%; translate: 0 -50%; height: clamp(8px, 1.1vw, 18px);
  border-radius: 999px; overflow: hidden; background: var(--husk); transition: background-color 150ms; }
.seq-pill:hover .seq-pill-bar { background: var(--line); }
.seq-acts { display: grid; margin-top: clamp(8px, 2.4svh, 40px); }
.seq-acts > * { grid-area: 1 / 1; }
.seq-title { font-family: var(--font-bricolage), sans-serif; font-weight: 800; line-height: 0.95; letter-spacing: -0.045em; text-wrap: balance;
  font-size: clamp(1.75rem, min(1.1rem + 4.6vw, 10svh, 24cqi), 6rem); }
.seq-body { margin-top: clamp(10px, 2.2svh, 36px); font-size: var(--fs-lead); line-height: 1.32; letter-spacing: -0.01em; max-width: 24ch; text-wrap: pretty; }
.seq-next { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 48px; padding: 0 22px;
  border-radius: 999px; font-weight: 600; font-size: clamp(0.9375rem, 0.86rem + 0.2vw, 1.0625rem); white-space: nowrap; }
.seq-note { font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: var(--fs-micro); color: var(--clay); }

/* copy column | chart */
@media (min-width: 640px) and (min-aspect-ratio: 6/5) {
  .seq-card { grid-template-columns: clamp(260px, 32vw, 460px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: "copy chart" "foot chart"; }
  .seq-foot { flex-direction: column; align-items: flex-start; gap: clamp(14px, 3svh, 36px); }
  .seq-chart { padding: clamp(14px, 3svh, 44px) clamp(14px, 2vw, 36px) clamp(14px, 3svh, 36px); }
  .seq-grid { mask-image: linear-gradient(to right, transparent, #000 12%); }
}
/* short landscape screens (phones on their side, small laptops): the copy column is short, so type follows height */
@media (min-width: 640px) and (max-height: 600px) {
  .seq-title { font-size: clamp(1.5rem, 8svh, 3rem); }
  .seq-body { margin-top: 8px; font-size: max(0.9375rem, min(var(--fs-lead), 4.4svh)); }
}
/* tablets upright: title and body side by side above the chart */
@media (min-width: 640px) and (max-aspect-ratio: 6/5) {
  .seq-act { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: end; }
  .seq-act .seq-body { margin-top: 0; }
}
/* phones */
.seq-frame[data-frame=mobile] .seq-title { font-size: clamp(1.625rem, min(1.05rem + 3vw, 5.4svh), 2.25rem); }
.seq-frame[data-frame=mobile] .seq-label { font-size: 0.8125rem; }
.seq-frame[data-frame=mobile] .seq-body { font-size: 1rem; }
.seq-frame[data-frame=mobile] .seq-next { height: 44px; padding: 0 18px; font-size: 0.9375rem; }
.seq-frame[data-frame=mobile] .seq-pill-bar { height: 8px; }
.seq-frame[data-frame=mobile] .seq-note { text-align: right; line-height: 1.35; }
@media (max-width: 359.98px) { .seq-frame[data-frame=mobile] .seq-next { padding: 0 14px; } }
.seq-frame[data-frame=mobile] .seq-acts { margin-top: 6px; }
`;

function Chart({ D, t, lang }: { D: Drawing; t: Dictionary; lang: Locale }) {
  const s = t.sequence;
  const months = bars(D);
  const lineY = months[0].lineY;
  const nf = new Intl.NumberFormat(numberLocale[lang], { maximumFractionDigits: 0 });
  return (
    <div data-canvas className="seq-canvas" style={{ ["--dw" as string]: D.w, ["--dh" as string]: D.h }}>
      {/* the months */}
      <div aria-hidden>
        {months.map((m) => {
          const x = m.cx - D.barW / 2;
          const cutY = lineY - m.excessH * TAX_SHARE;
          const r = u(D.barW / 18);
          return (
            <div key={m.month}>
              {/* the label box sits above the bar (clear of the lifted chunks in act 2) and grows upward when its floor kicks in */}
              <div
                data-tag
                className="flex flex-col items-center justify-end text-center"
                style={at({ x: m.cx - 90, y: m.top - 126, w: 180, h: 100 })}
              >
                {D.tag.client > 0 && (
                  <p className="seq-client text-clay" style={{ fontSize: fu(D.tag.client, 12), fontWeight: 600, lineHeight: 1.2, marginBottom: u(6), whiteSpace: "nowrap" }}>
                    {m.client ?? s.empty}
                  </p>
                )}
                <p className="font-mono tabular text-night" style={{ fontSize: fu(D.tag.amount, D.tag.amountMin), lineHeight: 1, whiteSpace: "nowrap" }}>
                  {D.tag.prefix ? money(m.amount, lang) : nf.format(m.amount)}
                </p>
              </div>
              {m.baseH > 0 && (
                <div data-grow className="bg-night" style={at({ x, y: D.base - m.baseH, w: D.barW, h: m.baseH }, { borderRadius: m.excessH ? 0 : `${r} ${r} 0 0` })} />
              )}
              {m.excessH > 0 && (
                <>
                  <div
                    data-grow
                    data-chunk="taxes"
                    data-cx={m.cx}
                    data-cy={cutY + (m.excessH * TAX_SHARE) / 2}
                    className="bg-night"
                    style={at({ x, y: cutY, w: D.barW, h: m.excessH * TAX_SHARE + 1 }, HIDDEN)}
                  />
                  <div
                    data-grow
                    data-chunk="cushion"
                    data-cx={m.cx}
                    data-cy={lineY - m.excessH + (m.excessH * (1 - TAX_SHARE)) / 2}
                    className="bg-night"
                    style={at({ x, y: lineY - m.excessH, w: D.barW, h: m.excessH * (1 - TAX_SHARE) + 1 }, { borderRadius: `${r} ${r} 0 0`, ...HIDDEN })}
                  />
                </>
              )}
              {m.gapH > 0 && (
                <>
                  <div data-gap style={at({ x, y: lineY, w: D.barW, h: m.gapH }, { border: `${u(D.barW / 36)} dashed var(--clay)`, borderRadius: r })} />
                  <div data-fill className="bg-marigold" style={at({ x, y: lineY, w: D.barW, h: m.gapH + 1 }, { borderRadius: m.baseH ? 0 : `${r} ${r} 0 0` })} />
                </>
              )}
              <p
                className="font-mono text-night"
                style={{ ...at({ x: m.cx - 60, y: D.base + D.month.dy, w: 120, h: D.month.font + 4 }), textAlign: "center", fontSize: fu(D.month.font, D.month.min), lineHeight: 1 }}
              >
                {monthName(m.month, lang)}
              </p>
              <div className="flex justify-center" style={at({ x: m.cx - 100, y: D.base + D.chip.dy, w: 200, h: D.chip.h })}>
                <p
                  data-chip
                  className="flex items-center justify-center font-mono tabular text-calyx bg-calyx-tint"
                  style={{
                    width: D.chip.minW ? `max(${u(D.chip.w)}, ${D.chip.minW}px)` : u(D.chip.w),
                    height: D.chip.minW ? `max(${u(D.chip.h)}, 24px)` : u(D.chip.h),
                    borderRadius: u(D.chip.h * 0.3),
                    fontSize: D.chip.min ? fu(D.chip.font, D.chip.min) : u(D.chip.font),
                    gap: u(6),
                    whiteSpace: "nowrap",
                  }}
                >
                  <Check size={D.chip.min ? fu(D.chip.font, D.chip.min) : u(D.chip.font)} />
                  {D.chip.amount && money(SALARY, lang)}
                </p>
              </div>
            </div>
          );
        })}
        <div data-line className="bg-hibiscus" style={at({ x: D.line.x, y: lineY - D.line.h / 2, w: D.line.w, h: D.line.h }, { borderRadius: u(2) })} />
      </div>

      {D.caption && (
        <p
          data-chip
          aria-hidden
          className="font-mono tabular text-calyx"
          style={{ ...at({ x: 0, y: D.base + D.caption.dy, w: D.w, h: D.caption.font + 4 }), textAlign: "center", fontSize: fu(D.caption.font, 12), lineHeight: 1, whiteSpace: "nowrap" }}
        >
          {t.simulator.salary} · {money(SALARY, lang)} · {s.payday}
        </p>
      )}

      {/* the boxes */}
      {([
        ["taxes", D.taxBox, s.taxes],
        ["cushion", D.cushionBox, s.cushion],
      ] as const).map(([key, box, label]) => (
        <div
          key={key}
          data-box={key}
          className="bg-card"
          style={at(box, { border: `max(${u(1.5)}, 1px) solid var(--line)`, borderRadius: u(D.box.radius), padding: `${u(D.box.pad)} ${u(D.box.pad)} 0` })}
        >
          <p style={{ fontSize: fu(D.box.label, D.box.min), fontWeight: 600, lineHeight: 1 }}>{label}</p>
          <div
            className={D.name === "desktop" ? "flex items-center" : "flex flex-col-reverse items-stretch"}
            style={{ marginTop: u(D.box.gap), gap: u(D.box.gap) }}
          >
            <div aria-hidden className="relative flex-1 overflow-hidden bg-husk" style={{ height: u(D.box.bar), minHeight: u(D.box.bar), borderRadius: u(999) }}>
              <div
                data-bar={key}
                className="absolute inset-0 bg-marigold"
                style={{ borderRadius: u(999), transformOrigin: "0% 50%", transform: `scaleX(${key === "taxes" ? 0.82 : 0.16})` }}
              />
            </div>
            <p
              data-amount={key}
              className="font-mono tabular"
              style={{ fontSize: fu(D.box.amount, D.box.min), lineHeight: 1, textAlign: D.name === "desktop" ? "right" : "left", minWidth: D.name === "desktop" ? u(120) : 0 }}
            >
              {money(key === "taxes" ? TAXES : CUSHION_OUT, lang)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Frame({ D, t, lang }: { D: Drawing; t: Dictionary; lang: Locale }) {
  const s = t.sequence;
  return (
    <div data-frame={D.name} className="seq-frame">
      <div data-stage className="seq-card">
        <div className="seq-copy">
          {/* act label + progress */}
          <div className="grid">
            {s.acts.map((_, i) => (
              <p key={i} data-act-label aria-hidden className="seq-label text-night" style={{ gridArea: "1 / 1", ...(i !== 3 ? HIDDEN : {}) }}>
                {s.act.replace("{n}", String(i + 1))}
              </p>
            ))}
          </div>
          <div className="seq-pills">
            {s.acts.map((_, i) => (
              <button key={i} type="button" data-goto={i + 1} aria-label={s.goto.replace("{n}", String(i + 1))} className="seq-pill">
                <span className="seq-pill-bar">
                  <span data-pill className="absolute inset-0 bg-hibiscus" style={{ borderRadius: 999 }} />
                </span>
              </button>
            ))}
          </div>

          {/* act copy: all four share one grid cell, so the box is as tall as the longest */}
          <div className="seq-acts">
            {s.acts.map((act, i) => (
              <div key={i} data-act aria-hidden className="seq-act" style={i !== 3 ? HIDDEN : undefined}>
                <h3 className="seq-title text-night">{act.title}</h3>
                <p className="seq-body">{act.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="seq-chart">
          <div aria-hidden className="seq-grid" />
          <Chart D={D} t={t} lang={lang} />
        </div>

        <div className="seq-foot">
          <button type="button" data-next className="seq-next bg-night text-blush transition-colors hover:bg-hibiscus" style={HIDDEN}>
            <span data-next-label>{s.next}</span>
            <span data-last-label style={{ display: "none" }}>
              {s.tryIt}
            </span>
            <svg aria-hidden viewBox="0 0 24 24" style={{ width: "1.1em", height: "1.1em" }} fill="none">
              <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="seq-note">{s.sample}</p>
        </div>
      </div>
    </div>
  );
}

export function Sequence({ t, lang }: { t: Dictionary; lang: Locale }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const section = root.current!;
      const frame = (name: string) => section.querySelector<HTMLElement>(`[data-frame=${name}]`)!;

      // review hook: ?act=1..4 freezes the sequence on that act (for screenshots)
      const still = Number(new URLSearchParams(window.location.search).get("act"));
      if (still >= 1 && still <= 4) {
        for (const D of [DESKTOP, MOBILE]) buildTimeline(frame(D.name), D, lang).progress(SNAPS[still] / 4).pause();
        return;
      }

      const mm = gsap.matchMedia();
      const pin = (D: Drawing) => () => {
        ScrollTrigger.create({
          trigger: section,
          start: "center center",
          end: D.name === "desktop" ? "+=320%" : "+=280%",
          pin: true,
          scrub: 0.6,
          animation: buildTimeline(frame(D.name), D, lang),
          invalidateOnRefresh: true,
          snap: { snapTo: SNAPS.map((v) => v / 4), duration: { min: 0.2, max: 0.6 }, delay: 0.08, ease: "power1.inOut" },
        });
      };
      mm.add("(min-width: 640px) and (prefers-reduced-motion: no-preference)", pin(DESKTOP));
      mm.add("(max-width: 639.98px) and (prefers-reduced-motion: no-preference)", pin(MOBILE));
      const toSimulator = () =>
        document.getElementById("salary")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      const target = (e: Event, current: number) => {
        const el = e.target as HTMLElement;
        if (el.closest("[data-next]")) {
          if (current === 4) {
            toSimulator();
            return 0;
          }
          return current + 1;
        }
        return Number(el.closest<HTMLElement>("[data-goto]")?.dataset.goto) || 0;
      };

      // reduced motion: no pin, no scrub; the visitor steps through the acts (pills or "Next act"), each step a short crossfade
      mm.add("(prefers-reduced-motion: reduce)", () => {
        const tls = [DESKTOP, MOBILE].map((D) => buildTimeline(frame(D.name), D, lang).progress(SNAPS[1] / 4).pause());
        const stages = section.querySelectorAll("[data-stage]");
        let current = 1;
        const onClick = (e: Event) => {
          const n = target(e, current);
          if (!n || n === current) return;
          current = n;
          gsap
            .timeline()
            .to(stages, { autoAlpha: 0.2, duration: 0.15 })
            .add(() => tls.forEach((tl) => tl.progress(SNAPS[n] / 4)))
            .to(stages, { autoAlpha: 1, duration: 0.2 });
        };
        section.addEventListener("click", onClick);
        return () => section.removeEventListener("click", onClick);
      });

      // with motion: pills and "Next act" scroll to that act's resting point
      const onGoto = (e: Event) => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const st = ScrollTrigger.getAll().find((s) => s.trigger === section);
        if (!st) return;
        const at = st.progress * 4;
        const current = Math.max(1, SNAPS.filter((v) => v <= at + 0.05).length - 1);
        const n = target(e, current);
        if (n) window.scrollTo({ top: st.start + (st.end - st.start) * (SNAPS[n] / 4), behavior: "smooth" });
      };
      section.addEventListener("click", onGoto);
      return () => section.removeEventListener("click", onGoto);
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" aria-labelledby="how-title" className="relative w-full overflow-hidden bg-blush" style={{ height: "min(100svh, 960px)" }}>
      <style>{CSS}</style>
      <h2 id="how-title" className="sr-only">
        {t.nav.how}
      </h2>
      {/* the story for assistive technology: the visual acts and chart are aria-hidden */}
      <div className="sr-only">
        <ol>
          {t.sequence.acts.map((a) => (
            <li key={a.title}>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </li>
          ))}
        </ol>
        <p>
          {t.sequence.summary
            .replace("{months}", PAYMENTS.map((p) => `${monthName(p.month, lang)} ${money(p.amount, lang)}`).join(", "))
            .replace("{taxes}", money(TAXES, lang))
            .replace("{cushion}", money(CUSHION_OUT, lang))
            .replace("{salary}", money(SALARY, lang))}
        </p>
      </div>
      <Frame D={DESKTOP} t={t} lang={lang} />
      <Frame D={MOBILE} t={t} lang={lang} />
    </section>
  );
}
