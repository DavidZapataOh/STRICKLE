"use client";

import { useEffect, useRef, useState } from "react";
import { drawInstrument } from "./instrument/draw";
import { GEOMETRY, createSim, spoutAt, step, type Phase, type SimState } from "./instrument/sim";
import { Verdict } from "./Verdict";

const MAX_DPR = 1.5;
const HOVER_TOLERANCE_PX = 24;
const UI_TICK_MS = 200;

interface UiSnapshot {
  phase: Phase;
  elapsedMs: number;
  spouts: number[]; // x positions, 0–1
}

function readColors(el: HTMLElement): { ink: string; accent: string } {
  const cs = getComputedStyle(el);
  return {
    ink: cs.getPropertyValue("--ink").trim() || "#171A1F",
    accent: cs.getPropertyValue("--accent").trim() || "#AB842B",
  };
}

function snapshot(sim: SimState): UiSnapshot {
  return { phase: sim.phase, elapsedMs: sim.cycleElapsed, spouts: sim.spouts.map((s) => s.x) };
}

export function Instrument() {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [ui, setUi] = useState<UiSnapshot>({ phase: "verdict", elapsedMs: 0, spouts: [] });
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sim = createSim((Date.now() >>> 0) || 1, { reducedMotion: reduced });
    simRef.current = sim;
    setMounted(true);
    setUi(snapshot(sim));

    let width = 0;
    let height = 0;
    let dpr = 1;
    const colors = readColors(box);

    const render = () => drawInstrument(ctx, sim, width, height, colors);

    const resize = () => {
      const rect = box.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    if (reduced) {
      return () => ro.disconnect();
    }

    let visible = true;
    let pageVisible = !document.hidden;
    let raf = 0;
    let last = 0;
    let lastUi = 0;
    let lastPhase: Phase = sim.phase;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last === 0 ? 16 : now - last;
      last = now;
      step(sim, dt);
      render();
      if (sim.phase !== lastPhase || now - lastUi >= UI_TICK_MS) {
        lastPhase = sim.phase;
        lastUi = now;
        setUi(snapshot(sim));
      }
    };
    const start = () => {
      if (raf === 0 && visible && pageVisible) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(box);

    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const sim = simRef.current;
    const box = boxRef.current;
    if (!sim || !box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setHovered(spoutAt(sim, x, y, HOVER_TOLERANCE_PX / rect.width));
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <div
        ref={boxRef}
        className="relative aspect-[4/3] w-full max-w-[560px] md:aspect-square"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block" />

        {/* Server / pre-hydration fallback: the static mark. */}
        {!mounted && (
          <div className="absolute inset-0 flex items-center justify-center text-ink" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="160" height="160" fill="none">
              <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
              <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="3.5" />
              <rect x="15" y="19" width="18" height="16" fill="currentColor" opacity=".22" />
            </svg>
          </div>
        )}

        {/* Rim tick and threshold label. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-2 font-mono text-[11px] text-ink-muted"
          style={{ right: `${(1 - GEOMETRY.bowlLeft) * 100}%`, top: `${GEOMETRY.rim * 100}%` }}
        >
          <span className="whitespace-nowrap">16 % · threshold</span>
          <span className="block h-px w-2 bg-ink-muted" />
        </div>

        {/* Supplier labels on hover. */}
        {ui.spouts.map((x, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`pointer-events-none absolute whitespace-nowrap rounded-[4px] border border-edge bg-panel px-2 py-1 font-mono text-[11px] text-ink transition-opacity duration-150 ${
              hovered === i ? "opacity-100" : "opacity-0"
            }`}
            style={{ left: `calc(${x * 100}% + 12px)`, top: `${GEOMETRY.spoutY * 100}%`, transform: "translateY(-100%)" }}
          >
            Supplier {String(i + 1).padStart(2, "0")} · signed · not disclosed
          </div>
        ))}
      </div>

      <Verdict phase={mounted ? ui.phase : "verdict"} elapsedMs={ui.elapsedMs} />
    </div>
  );
}
