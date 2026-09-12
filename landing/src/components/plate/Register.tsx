import { register as c } from "@/content/landing";
import { Engraved, Plate } from "./Plate";

/** Two ledgers: the public register struck straight into the steel, the sponsor's book kept as an object. */
export function Register() {
  return (
    <Plate id={c.id} inner="py-[clamp(72px,10vw,128px)]">
      <Engraved size="lg">{c.title}</Engraved>
      <div className="mt-[clamp(36px,5vw,64px)] grid gap-12 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-start md:gap-16">
        <div>
          <p className="engraved font-display text-subtitle font-bold">{c.publicSide.label}</p>
          <dl className="mt-5">
            {c.publicSide.rows.map(([k, v]) => (
              <div key={k} className="ledger-row font-mono text-body">
                <dt className="text-steel-600">{k}</dt>
                <dd className="engraved tabular-nums font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 max-w-[56ch] font-body text-body leading-relaxed text-steel-600">{c.note}</p>
        </div>
        <div className="tool p-7 text-steel-50 md:p-8">
          <p className="engraved font-display text-subtitle font-bold">{c.privateSide.label}</p>
          <dl className="mt-5 flex flex-col">
            {c.privateSide.rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-3 font-mono text-small" style={{ boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.6), inset 0 -2px 0 rgba(255,255,255,0.05)" }}>
                <dt className="text-steel-300">{k}</dt>
                <dd className="flex items-center gap-2 text-steel-300">
                  <span aria-hidden="true" className="hatch w-20" />
                  <span className="font-body text-micro">{v}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Plate>
  );
}
