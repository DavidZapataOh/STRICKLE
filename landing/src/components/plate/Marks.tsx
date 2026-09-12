import { marks as c, type Mark } from "@/content/landing";
import { Strike } from "@/components/reveal/Strike";
import { Engraved, Plate } from "./Plate";

const SHAPE: Record<Mark["shape"], string> = {
  oval: "cartouche-oval",
  octagon: "cartouche-octagon",
  soft: "cartouche-soft",
  round: "cartouche-round",
};

function Glyph({ mark }: { mark: Mark }) {
  switch (mark.glyph) {
    case "sealed":
      return <span aria-hidden="true" className="hatch hatch-fill block aspect-[1.55] w-[62%] rounded-[3px]" />;
    case "numerals":
    case "lot":
      return (
        <span className="struck-ink font-display text-[clamp(40px,4.6vw,66px)] font-extrabold leading-none tabular-nums tracking-[-0.03em]">
          {mark.value}
        </span>
      );
    case "cupel":
      return (
        <svg viewBox="0 0 48 48" width="52%" height="52%" fill="none" aria-hidden="true" className="struck-ink">
          <path d="M8 16h32l-5 18H13L8 16Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
          <path d="M4 40h40" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "control":
      return (
        <svg viewBox="0 0 48 48" width="52%" height="52%" fill="none" aria-hidden="true" className="struck-ink">
          <path d="M4 14H44" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="4" />
          <rect x="15" y="19" width="18" height="16" fill="currentColor" opacity=".25" />
        </svg>
      );
  }
}

/** The brass nameplate: five marks struck in a row. */
export function Marks() {
  return (
    <Plate id={c.id} tone="brass" inner="py-[clamp(64px,9vw,120px)]">
      <Engraved size="xl">{c.title}</Engraved>

      <Strike as="ol" threshold={0.35} className="mt-[clamp(40px,6vw,80px)] grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-8">
        {c.items.map((m, i) => (
          <li key={m.id} className={`flex flex-col items-center text-center ${i === c.items.length - 1 ? "col-span-2 sm:col-span-1" : ""}`} style={{ ["--i" as string]: i }}>
            <div className={`cartouche ${SHAPE[m.shape]} aspect-square w-[min(100%,196px)]`}>
              <Glyph mark={m} />
            </div>
            <p
              className={`engraved mt-6 font-display text-[clamp(18px,2vw,22px)] font-bold leading-tight ${
                m.verdict ? "verdict-word flex items-center gap-2" : ""
              }`}
            >
              {m.verdict && <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-current" />}
              {m.name}
            </p>
            <p className="muted mt-1.5 max-w-[22ch] font-body text-[14px] leading-snug">{m.meaning}</p>
          </li>
        ))}
      </Strike>

      <div className="mt-[clamp(48px,7vw,96px)] grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <p className="engraved font-display text-[clamp(20px,2.4vw,28px)] font-bold leading-snug [text-wrap:pretty]">{c.lines[0]}</p>
        <p className="font-body text-[16px] leading-relaxed md:text-[17px] md:pt-1">{c.lines[1]}</p>
      </div>
    </Plate>
  );
}
