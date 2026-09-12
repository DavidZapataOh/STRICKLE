"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/reveal/useReducedMotion";
import { surfaces } from "@/content/landing";
import { clockAt, isDone, progressAt } from "./progress";

const c = surfaces.console;

/** Manufacturer console: eight sealed lots, Certify, a Brass progress bar, the verdict. */
export function Console() {
  const ref = useRef<HTMLDivElement>(null);
  const [ms, setMs] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let raf = 0;
    let start = 0;
    let running = false;
    const tick = (now: number) => {
      if (!start) start = now;
      setMs(now - start);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !running) {
          running = true;
          start = 0;
          raf = requestAnimationFrame(tick);
        } else if (!e.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const pct = reduced ? 100 : progressAt(ms);
  const done = reduced ? true : isDone(ms);

  return (
    <div ref={ref} className="surface flex flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-edge px-4 py-3">
        <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.10em] text-ink-muted">{c.label}</span>
        <span className="truncate font-mono text-[11px] text-ink-muted">{c.model}</span>
      </header>

      <ul className="flex flex-col gap-1.5 px-4 pt-4">
        {c.lots.map((lot, i) => (
          <li key={i} className="grid grid-cols-[18px_1fr_auto_auto] items-center gap-3 font-mono text-[11.5px] tabular-nums text-ink">
            <span className="text-ink-muted">{String(i + 1).padStart(2, "0")}</span>
            <span aria-hidden="true" className="hatch" style={{ width: `${lot.supplier}%` }} />
            <span className="sr-only">supplier sealed</span>
            <span className="text-ink-muted">{lot.total}</span>
            <span>{lot.recycled}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center justify-between gap-4 px-4">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none inline-flex h-9 items-center rounded-[4px] bg-ink px-4 font-body text-[13px] font-medium text-ground"
        >
          {c.button}
        </button>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted" aria-live="off">
          {done ? "Proof accepted" : `${c.proving} · ${clockAt(ms)}`}
        </span>
      </div>

      <div className="mt-3 px-4">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className={`mx-4 mt-4 flex items-center gap-2 rounded-[4px] border px-3 py-2 transition-opacity duration-500 ${done ? "border-ok bg-ok-bg opacity-100" : "border-transparent opacity-0"}`} aria-hidden={!done}>
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ok" />
        <span className="font-display text-[14px] font-bold text-ok">{c.done}</span>
      </div>

      <p className="mt-auto px-4 pb-4 pt-4 font-body text-[12px] text-ink-muted">{c.note}</p>
    </div>
  );
}
