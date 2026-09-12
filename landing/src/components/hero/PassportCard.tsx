import type { Piece } from "./timeline";

/**
 * One passport as a three-line label next to its floating piece:
 * name and regulation; the legible line (share, minimum, verdict);
 * and the sealed rows (supplier, quantity, price) as short hatches.
 */
export function PassportCard({
  piece,
  on,
  className = "",
  style,
}: {
  piece: Piece;
  on: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <article
      aria-hidden={!on}
      data-piece={piece.id}
      className={`passport ${on ? "passport-on" : ""} ${className}`}
      style={style}
    >
      <div className="passport-row flex items-center justify-between gap-4" style={{ transitionDelay: on ? "120ms" : "0ms" }}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="passport-seal" />
          <span className="engraved font-display text-small font-bold leading-none">{piece.name}</span>
        </span>
        <span className="whitespace-nowrap font-body text-micro text-ink-muted">{piece.regulation}</span>
      </div>

      <div className="passport-row mt-2 flex items-baseline justify-between gap-3" style={{ transitionDelay: on ? "260ms" : "0ms" }}>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-body text-micro text-ink-muted">{piece.disclosed.label}</span>
          <span className="engraved font-display text-lead font-extrabold leading-none tabular-nums">
            {piece.disclosed.value}
          </span>
          <span className="font-body text-micro text-ink-muted">· {piece.disclosed.minimum}</span>
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
          <span className="font-display text-caption font-bold leading-none text-ok">Compliant</span>
        </span>
      </div>

      <ul className="passport-row mt-2 flex items-center gap-3" style={{ transitionDelay: on ? "400ms" : "0ms" }}>
        {piece.sealed.map((row) => (
          <li key={row.label} className="flex min-w-0 items-center gap-1.5">
            <span className="font-body text-micro text-ink-muted">{row.label}</span>
            <span aria-hidden="true" className="passport-hatch" style={{ width: `${Math.round(row.width * 0.5)}px` }} />
            <span className="sr-only">not disclosed</span>
          </li>
        ))}
        <li className="ml-auto font-body text-micro text-ink-muted">not disclosed</li>
      </ul>
    </article>
  );
}
