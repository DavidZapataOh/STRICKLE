export function Progress({ ratio, label }: { ratio: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <span className="meter" role="img" aria-label={`${label}: ${percent}%`}>
      <span className="meter-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}
