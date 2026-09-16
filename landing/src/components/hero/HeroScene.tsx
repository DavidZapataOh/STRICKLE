"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { PassportCard } from "./PassportCard";
import {
  activePiece,
  type Box,
  coverBox,
  FRAME_ASPECT,
  PIECES,
  type Piece,
  toScreen,
} from "./timeline";

const VIDEO_SRC = "/media/hero-loop.mp4";
const POSTER_SRC = "/media/hero-poster.jpg";

/** Share of the horizontal overflow hidden on the left when the viewport is narrow. */
const FOCUS_X = 0.72;

type SceneContext = { current: Piece | null };

const Ctx = createContext<SceneContext | null>(null);

export function useScene(): SceneContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useScene must be used inside <HeroScene>");
  return ctx;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function labelStyle(piece: Piece, box: Box): React.CSSProperties {
  const p = toScreen(piece.label, box);
  if (piece.label.pin === "right-center") {
    return { right: `calc(100% - ${p.x}px)`, top: p.y, transform: "translateY(-50%)" };
  }
  return { left: p.x, top: p.y };
}

/**
 * Full-bleed hero stage: the looping video, a localized fade behind the copy,
 * and, on md+, a passport label pinned next to whichever piece is floating.
 * Static content (header, copy, rail) comes in as children above the video.
 */
export function HeroScene({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [active, setActive] = useState<Piece["id"] | null>(null);
  const [reduced, setReduced] = useState(false);

  // Cover box: the rectangle the 1928 × 1072 frame occupies in the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) setBox(coverBox(width, height, FRAME_ASPECT, FOCUS_X));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reduced motion: poster only, nothing floats.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // The <video> mounts once the cover box is measured; effects below wait for it.
  const mounted = box !== null;

  // Play only while on screen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduced) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [reduced, mounted]);

  // Sync the passport with the video clock.
  useEffect(() => {
    const video = videoRef.current as VideoWithFrameCallback | null;
    if (!video || reduced) return;
    let handle = 0;
    let last: Piece["id"] | null = null;
    const useVfc = typeof video.requestVideoFrameCallback === "function";
    const tick = () => {
      const next = activePiece(video.currentTime)?.id ?? null;
      if (next !== last) {
        last = next;
        setActive(next);
      }
      handle = useVfc ? video.requestVideoFrameCallback!(tick) : requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (useVfc) video.cancelVideoFrameCallback?.(handle);
      else cancelAnimationFrame(handle);
    };
  }, [reduced, mounted]);

  const current = PIECES.find((p) => p.id === active) ?? null;

  return (
    <Ctx.Provider value={{ current }}>
      <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
        {/* Video layer */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          {box && (
            <div
              className="absolute"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            >
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full"
                src={VIDEO_SRC}
                poster={POSTER_SRC}
                muted
                loop
                playsInline
                autoPlay={!reduced}
                preload="auto"
                tabIndex={-1}
              />
            </div>
          )}
          <div className="hero-fade absolute inset-0" />
        </div>

        {/* Passport labels pinned next to the pieces (md+). */}
        {box && (
          <div
            className="pointer-events-none absolute inset-0 z-20 hidden md:block"
            aria-live="polite"
          >
            {PIECES.map((piece) => (
              <PassportCard
                key={piece.id}
                piece={piece}
                on={current?.id === piece.id}
                className="absolute w-[clamp(340px,24vw,360px)]"
                style={labelStyle(piece, box)}
              />
            ))}
          </div>
        )}

        {children}
      </div>
    </Ctx.Provider>
  );
}
