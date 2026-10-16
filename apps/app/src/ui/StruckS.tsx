export function StruckS({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M200 42 L88 42 Q56 42 56 74 L56 114 L24 114 L24 142 L168 142 L168 184 L56 184 L56 214 L168 214 Q200 214 200 182 L200 142 L232 142 L232 114 L88 114 L88 72 L200 72 Z"
      />
    </svg>
  );
}
