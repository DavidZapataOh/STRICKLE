export function Wordmark({ className = "text-ink" }: { className?: string }) {
  return (
    <a href="#" className={`inline-flex items-center gap-3 ${className}`} aria-label="STRICKLE, home">
      <svg viewBox="0 0 48 48" width="28" height="28" fill="none" aria-hidden="true">
        <path d="M4 14H44" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="10.5" y="14" width="27" height="25.5" rx="2" stroke="currentColor" strokeWidth="3.5" />
        <rect x="15" y="19" width="18" height="16" fill="currentColor" opacity=".22" />
      </svg>
      <span className="font-display text-lead font-extrabold uppercase tracking-[0.06em]">STRICKLE</span>
    </a>
  );
}
