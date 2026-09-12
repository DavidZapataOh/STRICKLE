"use client";

import { useState } from "react";
import { surfaces } from "@/content/landing";

const c = surfaces.portal;

/** Notified-body portal: one field per request, the selector is a public parameter. */
export function RegulatorPortal() {
  const [i, setI] = useState(0);
  const f = c.fields[i];
  return (
    <div className="surface flex flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-edge px-4 py-3">
        <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.10em] text-ink-muted">{c.label}</span>
        <span className="truncate font-mono text-[11px] text-ink-muted">0x7f3a…c1</span>
      </header>

      <div className="px-4 pt-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">Request one field</p>
        <div role="tablist" aria-label="Field to disclose" className="mt-2 flex flex-wrap gap-1.5">
          {c.fields.map((x, k) => (
            <button
              key={x.key}
              role="tab"
              type="button"
              aria-selected={k === i}
              onClick={() => setI(k)}
              className={`rounded-[4px] border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors ${
                k === i ? "border-ink bg-ink text-ground" : "border-edge text-ink hover:border-ink"
              }`}
            >
              {x.key}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-5 rounded-[4px] border border-edge bg-ground/40 px-4 py-4" role="tabpanel">
        <p className="font-mono text-[11px] text-ink-muted">{f.key}</p>
        <p className="mt-1 font-display text-[28px] font-extrabold leading-none tabular-nums text-ink">{f.value}</p>
        <p className="mt-2 font-mono text-[11px] text-ink-muted">{f.note}</p>
      </div>

      <ul className="mt-4 flex flex-col gap-1.5 px-4 font-mono text-[11px] text-ink-muted">
        {c.fields.map((x, k) => (
          <li key={x.key} className="flex items-center justify-between gap-3">
            <span>{x.key}</span>
            {k === i ? <span className="text-ink">disclosed</span> : <span aria-hidden="true" className="hatch w-14" />}
          </li>
        ))}
      </ul>

      <p className="mt-auto px-4 pb-4 pt-5 font-body text-[12px] text-ink-muted">{c.hint}</p>
    </div>
  );
}
