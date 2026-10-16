import { formatMoney, formatPercent } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";

export function SplitBar({ parts, total, locale, asset = "USDC" }: { parts: { key: string; label: string; units: bigint }[]; total: bigint; locale: Locale; asset?: "USDC" | "EURC" }) {
  const shown = parts.filter((part) => part.units > 0n);
  const share = (units: bigint) => Number((units * 10_000n) / (total || 1n));
  const summary = shown.map((part) => `${part.label} ${formatPercent(share(part.units), locale)}`).join(", ");
  return (
    <figure className="split" role="img" aria-label={summary}>
      <div className="split-bar" aria-hidden>
        {shown.map((part) => (
          <span key={part.key} data-box={part.key} style={{ flexGrow: part.units.toString() as unknown as number }} />
        ))}
      </div>
      <ul className="split-legend">
        {shown.map((part) => (
          <li key={part.key}>
            <span className="split-dot" data-box={part.key} aria-hidden />
            <span className="split-name">{part.label}</span>
            <span className="split-share">{formatPercent(share(part.units), locale)}</span>
            <span className="amount">{formatMoney(part.units, locale, { asset })}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
