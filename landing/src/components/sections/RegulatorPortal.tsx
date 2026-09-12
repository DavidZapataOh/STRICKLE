"use client";

import { useState } from "react";
import { bench } from "@/content/landing";

const c = bench.portal;

/** Notified-body portal: one field per request; the selector is a public parameter. */
export function RegulatorPortal() {
  const [i, setI] = useState(0);
  const f = c.fields[i];
  return (
    <div className="tool flex h-full flex-col">
      <header className="tool-head">
        <span className="engraved whitespace-nowrap font-display text-caption font-bold">{c.label}</span>
        <span className="truncate font-mono text-micro text-steel-300">{c.passportId}</span>
      </header>

      <div className="px-4 pt-4">
        <p className="font-body text-micro text-steel-300">{c.prompt}</p>
        <div role="tablist" aria-label="Field to disclose" className="mt-2 flex flex-wrap gap-1.5">
          {c.fields.map((x, k) => (
            <button key={x.key} role="tab" type="button" aria-selected={k === i} onClick={() => setI(k)} className="chip font-body text-micro">
              {x.key}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-5 rounded-[6px] px-4 py-4" role="tabpanel" style={{ boxShadow: "inset 2px 3px 8px rgba(0,0,0,0.6), inset -1px -1px 1px rgba(255,255,255,0.05)", background: "#171a1f" }}>
        <p className="font-body text-micro text-steel-300">{f.key}</p>
        <p className="struck-ink mt-1 font-display text-title font-extrabold leading-none tabular-nums">{f.value}</p>
        <p className="mt-2 font-body text-micro text-steel-300">{f.note}</p>
      </div>

      <ul className="mt-4 flex flex-col gap-1.5 px-4 font-body text-micro text-steel-300">
        {c.fields.map((x, k) => (
          <li key={x.key} className="flex items-center justify-between gap-3">
            <span>{x.key}</span>
            {k === i ? <span className="text-steel-50">disclosed</span> : <span aria-hidden="true" className="hatch w-14" />}
          </li>
        ))}
      </ul>

      <p className="mt-auto px-4 pb-4 pt-5 font-body text-micro text-steel-300">{c.hint}</p>
    </div>
  );
}
