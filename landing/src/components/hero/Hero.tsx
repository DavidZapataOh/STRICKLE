import { Instrument } from "./Instrument";

const RAIL = [
  "Regulation (EU) 2023/1542",
  "Passport mandatory 18 Feb 2027",
  "16 % Co · 85 % Pb · 6 % Li · 6 % Ni",
];

export function Hero() {
  return (
    <section className="flex min-h-[calc(100svh-68px)] flex-col">
      <div className="grid flex-1 items-center gap-12 px-[clamp(24px,4vw,64px)] py-12 max-md:px-[22px] md:grid-cols-[46fr_54fr] md:py-8">
        <div className="max-w-[620px]">
          <p className="reveal font-body text-[12px] font-medium uppercase tracking-[0.10em] text-ink-muted">
            Confidential product passport · Batteries
          </p>
          <h1 className="reveal reveal-delay-1 mt-5 font-display text-[clamp(38px,10vw,56px)] font-extrabold leading-none tracking-[-0.01em] text-ink [text-wrap:balance] md:text-[clamp(44px,5.4vw,84px)]">
            Prove the threshold.
            <br />
            <em className="font-bold">Keep the recipe.</em>
          </h1>
          <p className="reveal reveal-delay-2 mt-6 max-w-[460px] font-body text-[17px] leading-normal text-ink">
            Signed supplier attestations, aggregated inside a zero-knowledge circuit, become one verdict on chain:
            the recycled-content minimum is met. Suppliers, quantities and prices never leave your device.
          </p>
          <div className="reveal reveal-delay-3 mt-8 flex flex-wrap items-center gap-6">
            <a
              href="#"
              className="inline-flex h-11 items-center rounded-[4px] bg-ink px-5 font-body text-[15px] font-medium text-ground"
            >
              Open the console
            </a>
            <a href="#" className="font-body text-[15px] font-medium text-accent-text hover:underline">
              Read how it works →
            </a>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="w-full md:w-[min(560px,42vw)]">
            <Instrument />
          </div>
        </div>
      </div>

      <footer className="flex h-14 items-center justify-between gap-6 border-t border-edge px-[clamp(24px,4vw,64px)] font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted tabular-nums max-md:px-[22px]">
        <ul className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap">
          {RAIL.map((item, i) => (
            <li key={item} className={`flex items-center gap-3 ${i > 0 ? "max-md:hidden" : ""}`}>
              {i > 0 && <span aria-hidden="true">·</span>}
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <span className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-ink" />
          Built on Midnight
        </span>
      </footer>
    </section>
  );
}
