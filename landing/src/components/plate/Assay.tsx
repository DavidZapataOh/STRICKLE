"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/reveal/useReducedMotion";
import { assay as c } from "@/content/landing";
import { Engraved, Plate } from "./Plate";

/** One object in four recoverable states: sample, assay, strike, register. */
export function Assay() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || paused || !inView) return;
    const t = window.setTimeout(() => setI((i + 1) % c.states.length), c.dwellMs);
    return () => window.clearTimeout(t);
  }, [i, paused, inView, reduced]);

  useEffect(() => {
    videoRefs.current.forEach((v, k) => {
      if (!v) return;
      if (k === i && inView && !reduced) v.play().catch(() => {});
      else v.pause();
    });
  }, [i, inView, reduced]);

  const s = c.states[i];

  return (
    <Plate id={c.id} inner="py-[clamp(72px,10vw,128px)]">
      <section
        ref={rootRef}
        aria-label={c.title}
        className={`assay ${paused ? "paused" : ""}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <Engraved size="lg">{c.title}</Engraved>

        <div className="mt-[clamp(36px,5vw,64px)] grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div
            role="tablist"
            aria-label="Assay states"
            className="order-2 flex flex-col gap-1 lg:order-1"
          >
            {c.states.map((st, k) => (
              <button
                key={st.key}
                role="tab"
                type="button"
                id={`assay-tab-${st.key}`}
                aria-selected={k === i}
                aria-controls={`assay-panel-${st.key}`}
                onClick={() => setI(k)}
                className="state"
                style={{ ["--dwell" as string]: `${c.dwellMs}ms` }}
              >
                <span className="block font-display text-title font-extrabold leading-none tracking-[-0.02em]">
                  {st.label}
                </span>
                <span
                  className={`mt-2 block font-body text-body leading-snug ${k === i ? "text-steel-900" : "text-steel-600"}`}
                >
                  {st.title}
                </span>
                <span
                  className={`mt-3 block max-w-[54ch] font-body text-body leading-relaxed text-steel-600 transition-[opacity,max-height] duration-300 ${
                    k === i ? "max-h-40 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                  }`}
                >
                  {st.body}
                  <span className="mt-2 block font-body text-caption text-steel-900">
                    {st.visible}
                  </span>
                </span>
                <span aria-hidden="true" className="state-bar">
                  <i />
                </span>
              </button>
            ))}
          </div>

          <div className="order-1 lg:order-2">
            <div
              className="frame aspect-[16/10]"
              role="tabpanel"
              id={`assay-panel-${s.key}`}
              aria-labelledby={`assay-tab-${s.key}`}
            >
              {c.states.map((st, k) =>
                st.media.kind === "video" ? (
                  <video
                    key={st.key}
                    ref={(el) => {
                      videoRefs.current[k] = el;
                    }}
                    className={`frame-fade ${k === i ? "opacity-100" : "opacity-0"}`}
                    src={st.media.src}
                    poster={st.media.src.replace(/\.mp4$/, ".jpg")}
                    muted
                    loop
                    playsInline
                    preload={k === i ? "auto" : "metadata"}
                    aria-label={st.media.alt}
                    tabIndex={-1}
                  />
                ) : (
                  <Image
                    key={st.key}
                    src={st.media.src}
                    alt={st.media.alt}
                    width={768}
                    height={432}
                    className={`frame-fade ${k === i ? "opacity-100" : "opacity-0"}`}
                  />
                ),
              )}
            </div>
            <p className="mt-3 font-body text-caption text-steel-600">{s.media.alt}</p>
          </div>
        </div>
      </section>
    </Plate>
  );
}
