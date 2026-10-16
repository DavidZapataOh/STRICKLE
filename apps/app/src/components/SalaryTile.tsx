import { formatMoney } from "@strickle/design/format";
import type { Locale } from "@strickle/design/locale";
import { dateText } from "@/home/format";
import type { Tile } from "@/home/tile";
import type { DataText } from "@/i18n/slices";
import { fill } from "@/i18n/fill";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";

export function SalaryTile({ lang, t, tile, cushion }: { lang: Locale; t: DataText; tile: Tile; cushion: { days: number | null; floorDays: number } }) {
  const money = (units: bigint) => formatMoney(units, lang);
  const chip = {
    secured: <Chip tone="calyx">{t.home.salary.secured}</Chip>,
    approval: <Chip>{t.home.salary.approval}</Chip>,
    partial: <Chip>{t.home.salary.partial}</Chip>,
    held: <Chip>{t.home.salary.held}</Chip>,
    stale: <Chip>{fill(t.home.salary.stale, { date: dateText(tile.checked, lang) })}</Chip>,
    none: null,
  }[tile.state];
  return (
    <section className="tile" data-state={tile.state} aria-labelledby="tile-title">
      <p id="tile-title" className="tile-label">{t.home.salary.next}</p>
      {tile.state === "none" ? (
        <p className="tile-figure">{t.home.salary.none}</p>
      ) : (
        <p className="tile-figure">
          <span className="amount">{money(tile.owed)}</span> <span>{fill(t.home.salary.on, { date: dateText(tile.next, lang) })}</span>
        </p>
      )}
      {chip}
      {tile.state === "partial" ? (
        <>
          <p className="tile-note">{fill(t.home.salary.payNow, { amount: money(tile.payNow) })}</p>
          <p className="tile-note">{fill(t.home.salary.pending, { amount: money(tile.pending) })}</p>
        </>
      ) : null}
      {tile.reason && tile.state !== "stale" ? <p className="tile-note">{t.home.reasons[tile.reason]}</p> : null}
      {tile.state === "approval" ? <Button href={`/${lang}/activity`} variant="quiet">{t.home.salary.review}</Button> : null}
      <p className="tile-cushion">{cushion.days === null ? t.home.cushion.unknown : `${fill(t.home.cushion.days, { days: cushion.days })} · ${fill(t.home.cushion.floor, { days: cushion.floorDays })}`}</p>
    </section>
  );
}
