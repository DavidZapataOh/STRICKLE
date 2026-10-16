export function Skeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton-line" aria-hidden />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
