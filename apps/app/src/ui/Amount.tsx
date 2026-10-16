import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";

export function Amount({ units, locale, asset, signed, tone = "neutral" }: { units: bigint; locale: Locale; asset?: "USDC" | "EURC"; signed?: boolean; tone?: "neutral" | "positive" | "loss" }) {
  return (
    <span className="amount" data-tone={tone}>
      {formatMoney(units, locale, { asset, signed })}
    </span>
  );
}
