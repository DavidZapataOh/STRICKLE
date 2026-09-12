"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/reveal/useReducedMotion";
import { bench } from "@/content/landing";
import { clockAt, isDone, progressAt } from "./progress";

const c = bench.console;

/** Manufacturer console: eight sealed lots, Certify, a brass proving bar, the verdict struck. */
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
    <div ref={ref} className="tool flex h-full flex-col">
      <header className="tool-head">
        <span className="engraved whitespace-nowrap font-display text-[13px] font-bold">{c.label}</span>
        <span className="truncate font-body text-[12px] text-steel-300">{c.model}</span>
      </header>

      <ul className="flex flex-col gap-1.5 px-4 pt-4 font-body text-[12.5px] tabular-nums text-steel-100">
        {c.lots.map((lot, i) => (
          <li key={i} className="grid grid-cols-[22px_1fr_auto_auto] items-center gap-3">
            <span className="text-steel-400">{String(i + 1).padStart(2, "0")}</span>
            <span aria-hidden="true" className="hatch" style={{ width: `${lot.supplier}%` }} />
            <span className="sr-only">supplier sealed</span>
            <span className="text-steel-300">{lot.total}</span>
            <span className="font-medium">{lot.recycled}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center justify-between gap-4 px-4">
        <span
          aria-hidden="true"
          className="chip pointer-events-none inline-flex h-9 items-center px-4 font-body text-[13px] font-medium"
          style={{ color: "var(--brass-ink)", background: "linear-gradient(180deg, var(--brass-hi), var(--brass))" }}
        >
          {c.button}
        </span>
        <span className="font-body text-[12.5px] tabular-nums text-steel-300">{done ? c.accepted : `${c.proving} · ${clockAt(ms)}`}</span>
      </div>

      <div className="mt-3 px-4">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <i style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>

      <div className={`verdict-plate mx-4 mt-4 flex items-center gap-2 ${done ? "is-struck" : ""}`} aria-hidden={!done}>
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-current" />
        <span className="font-display text-[14px] font-bold">{c.done}</span>
      </div>

      <p className="mt-auto px-4 pb-4 pt-4 font-body text-[12.5px] text-steel-300">{c.note}</p>
    </div>
  );
}
