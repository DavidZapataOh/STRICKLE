import type { Phase } from "./instrument/sim";

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function isCompliant(phase: Phase): boolean {
  return phase === "verdict" || phase === "draining";
}

export function Verdict({ phase, elapsedMs }: { phase: Phase; elapsedMs: number }) {
  const compliant = isCompliant(phase);
  return (
    <div aria-live="polite" className="relative">
      {/* Proving */}
      <div
        className={`absolute inset-0 flex items-center gap-2 font-mono text-[13px] text-ink-muted transition-opacity duration-[400ms] ${
          compliant ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden="true"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-ink">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="tabular-nums">Proving · {formatClock(elapsedMs)}</span>
      </div>

      {/* Compliant */}
      <div
        className={`relative flex items-start gap-3 rounded-[4px] border border-ok bg-ok-bg px-4 py-3 transition-opacity duration-[400ms] ${
          compliant ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!compliant}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-ok">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 10.5l2.5 2.5L14 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="font-display text-[20px] font-bold leading-tight text-ok">Compliant</div>
          <div className="font-body text-[13.5px] leading-normal text-ink">
            Meets the 16 % minimum · Regulation (EU) 2023/1542
          </div>
        </div>
      </div>
    </div>
  );
}
