import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Metrics } from "@/server/metrics";
import { Amount } from "@/ui/Amount";
import { Card } from "@/ui/Card";
import { ListRow } from "@/ui/ListRow";

const KINDS = ["split", "salary", "swap", "earn"] as const;

/** The recorded snapshot as the public sees it: every figure is the chain's, with the team apart from everyone else. A snapshot recorded before the agent's moves were counted simply has no such card. */
export function MetricsView({ lang, t, payload }: { lang: Locale; t: Pick<Dictionary, "metrics">; payload: Metrics }) {
  const m = t.metrics;
  const units = (value: string) => BigInt(value);
  const split = (amounts: { team: string; organic: string }) => (
    <>
      <ListRow title={m.team} trailing={<Amount units={units(amounts.team)} locale={lang} />} />
      <ListRow title={m.organic} trailing={<Amount units={units(amounts.organic)} locale={lang} />} />
    </>
  );
  return (
    <div className="public-view">
      <Card as="section" aria-labelledby="m-vaults">
        <h2 id="m-vaults">{m.vaults}</h2>
        <ListRow title={m.team} trailing={<span className="amount">{payload.vaults.team}</span>} />
        <ListRow title={m.organic} trailing={<span className="amount">{payload.vaults.organic}</span>} />
      </Card>
      <Card as="section" aria-labelledby="m-held">
        <h2 id="m-held">{m.held}</h2>
        {split(payload.usdcHeld)}
      </Card>
      <Card as="section" aria-labelledby="m-allocated">
        <h2 id="m-allocated">{m.allocated}</h2>
        {split(payload.usdcAllocated)}
      </Card>
      {payload.agentMoved ? (
        <Card as="section" aria-labelledby="m-moved">
          <h2 id="m-moved">{m.moved.title}</h2>
          {KINDS.map((kind) => (
            <div key={kind}>
              <h3 className="section-title">{m.moved.kinds[kind]}</h3>
              {split(payload.agentMoved.byKind[kind])}
            </div>
          ))}
          <h3 className="section-title">{m.moved.total}</h3>
          {split(payload.agentMoved.total)}
          <p className="note">{m.moved.private}</p>
        </Card>
      ) : null}
      <Card as="section" aria-labelledby="m-unmeasured">
        <h2 id="m-unmeasured">{m.notMeasured}</h2>
        {payload.notMeasured.map((name) => (
          <ListRow key={name} title={m.names[name as keyof typeof m.names] ?? name} trailing={<span className="note">{m.notMeasured}</span>} />
        ))}
      </Card>
      <p className="note">{m.rule}</p>
      <p className="note">
        {m.block} {payload.asOfBlock}
      </p>
    </div>
  );
}
