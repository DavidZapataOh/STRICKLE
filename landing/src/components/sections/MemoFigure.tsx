import { closing as c } from "@/content/landing";

/**
 * The memo on the limestone. Uses the photograph when it exists in
 * /public/media at build time; until then, a typographic cover in the
 * certificate style (Bronze ink, double rule, one seal).
 */
export function MemoFigure({ photo }: { photo: boolean }) {
  return (
    <figure className="relative aspect-[4/3] w-full overflow-hidden rounded-[6px] border border-edge bg-panel">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/media/memo.jpg"
          alt="The technical memorandum printed and lying on limestone paving"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-ground p-8">
          <div className="memo-paper w-[min(100%,300px)] p-6 text-[var(--strickle-bronze)]">
            <div className="flex items-center justify-between">
              <svg viewBox="0 0 48 48" width="16" height="16" fill="none" aria-hidden="true">
                <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="3.5" />
              </svg>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em]">Technical memorandum · 2026</span>
            </div>
            <p className="mt-6 font-display text-[16px] font-extrabold leading-tight">
              Prove the threshold.
              <br />
              <em className="font-bold">Keep the recipe.</em>
            </p>
            <ol className="mt-5 flex flex-col gap-1 font-mono text-[9.5px]">
              {c.toc.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p className="mt-6 font-mono text-[8.5px] uppercase tracking-[0.10em]">Suppliers and quantities not disclosed</p>
            <span aria-hidden="true" className="memo-seal" />
          </div>
        </div>
      )}
    </figure>
  );
}
