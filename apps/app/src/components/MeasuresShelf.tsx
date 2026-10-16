import type { BoxKind } from "@strickle/core";

// A measure holds either its progress to a target (Marigold) or its share of everything held when it has no target (Husk). Drawing only: no text.
export function MeasuresShelf({ boxes }: { boxes: { kind: BoxKind; ratio: number | null; share: number }[] }) {
  return (
    <svg className="shelf" viewBox="0 0 120 36" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {boxes.map((box, index) => {
        const x = 3 + index * 19.5;
        const level = Math.min(1, Math.max(0, box.ratio ?? box.share));
        const height = Math.round(24 * level * 100) / 100;
        return (
          <g key={box.kind} data-box={box.kind} data-target={box.ratio === null ? "none" : "set"}>
            <rect className="shelf-fill" x={x + 1} y={28 - height} width="13" height={height} />
            <path className="shelf-glass" d={`M${x} 4 V28 H${x + 15} V4`} fill="none" />
            <line className="shelf-strike" x1={x - 2} x2={x + 17} y1="8" y2="8" />
          </g>
        );
      })}
      <line className="shelf-board" x1="0" x2="120" y1="29" y2="29" />
    </svg>
  );
}
