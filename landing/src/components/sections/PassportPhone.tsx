import { surfaces } from "@/content/landing";

const c = surfaces.passport;

/** Consumer passport as it looks after scanning the QR: verdict first, absences written out. */
export function PassportPhone() {
  return (
    <div className="flex flex-col items-center">
      <span className="mb-4 font-mono text-[11px] uppercase tracking-[0.10em] text-ink-muted">{c.label}</span>
      <div className="phone w-[min(100%,272px)]">
        <div className="flex items-center gap-2 bg-[var(--strickle-steel)] px-4 py-3 text-[var(--strickle-zinc)]">
          <svg viewBox="0 0 48 48" width="18" height="18" fill="none" aria-hidden="true" className="text-[var(--strickle-brass-light)]">
            <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="3.5" />
            <rect x="15" y="19" width="18" height="16" fill="currentColor" opacity=".22" />
          </svg>
          <span className="font-display text-[12px] font-extrabold uppercase tracking-[0.06em]">STRICKLE</span>
        </div>
        <div className="bg-panel px-4 pb-4 pt-4 text-ink">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">{c.model}</p>
          <div className="mt-3 rounded-[4px] border border-ok bg-ok-bg px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ok" />
              <span className="font-display text-[20px] font-bold leading-none text-ok">{c.verdict}</span>
            </div>
            <p className="mt-1.5 font-body text-[11.5px] leading-snug text-ink">{c.basis}</p>
          </div>
          <dl className="mt-4 flex flex-col gap-1.5 font-mono text-[11px]">
            {c.rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-edge pb-1.5">
                <dt className="text-ink-muted">{k}</dt>
                <dd className={v.startsWith("not") ? "italic text-ink-muted" : "text-ink"}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.10em] text-ink-muted">{c.footer}</p>
        </div>
      </div>
    </div>
  );
}
