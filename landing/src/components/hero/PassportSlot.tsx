"use client";

import { useScene } from "./HeroScene";
import { PassportCard } from "./PassportCard";
import { PIECES } from "./timeline";

/**
 * Phone fallback: the active passport stacked under the copy, in flow.
 * Cards share one grid cell so the slot keeps the height of the tallest.
 * On md+ the labels live next to the pieces inside <HeroScene>.
 */
export function PassportSlot({ className = "" }: { className?: string }) {
  const { current } = useScene();
  return (
    <div className={`grid md:hidden ${className}`} aria-live="polite">
      {PIECES.map((piece) => (
        <PassportCard key={piece.id} piece={piece} on={current?.id === piece.id} className="[grid-area:1/1]" />
      ))}
    </div>
  );
}
