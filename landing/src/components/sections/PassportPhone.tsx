import { bench } from "@/content/landing";

const c = bench.passport;

/** Consumer passport after scanning the QR: verdict first, absences written out. */
export function PassportPhone() {
  return (
    <div className="flex h-full flex-col items-center">
      <span className="engraved mb-4 font-display text-caption font-bold">{c.label}</span>
      <div className="phone w-[min(100%,280px)]">
        <div className="phone-screen">
          <div className="flex items-center gap-2 bg-[var(--steel-900)] px-4 py-3 text-[var(--steel-50)]">
            <svg
              viewBox="0 0 48 48"
              width="18"
              height="18"
              fill="none"
              aria-hidden="true"
              className="text-[var(--brass-hi)]"
            >
              <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
              <rect
                x="10.5"
                y="14"
                width="27"
                height="25.5"
                rx="2"
                stroke="currentColor"
                strokeWidth="3.5"
              />
              <rect x="15" y="19" width="18" height="16" fill="currentColor" opacity=".22" />
            </svg>
            <span className="font-display text-micro font-extrabold uppercase tracking-[0.06em]">
              STRICKLE
            </span>
          </div>
          <div className="px-4 pb-4 pt-4">
            <p className="font-body text-micro text-steel-600">{c.model}</p>
            <div
              className="mt-3 rounded-[6px] px-3 py-2.5 text-[var(--verdict)]"
              style={{
                boxShadow: "inset 0 0 0 1px currentColor, inset 2px 3px 6px rgba(0,0,0,0.12)",
                background: "rgba(27,107,68,0.06)",
              }}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-current" />
                <span className="font-display text-subtitle font-bold leading-none">
                  {c.verdict}
                </span>
              </div>
              <p className="mt-1.5 font-body text-micro leading-snug text-steel-900">{c.basis}</p>
            </div>
            <dl className="mt-4 flex flex-col gap-1.5 font-body text-micro">
              {c.rows.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-3 border-b border-steel-200 pb-1.5"
                >
                  <dt className="text-steel-600">{k}</dt>
                  <dd
                    className={
                      v.startsWith("not") ? "italic text-steel-600" : "font-medium text-steel-900"
                    }
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-center font-body text-micro uppercase tracking-[0.08em] text-steel-600">
              {c.footer}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
