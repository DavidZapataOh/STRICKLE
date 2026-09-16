import { SiteHeader } from "@/components/site/SiteHeader";
import { HeroScene } from "./HeroScene";
import { PassportSlot } from "./PassportSlot";

const RAIL = [
  "Regulation (EU) 2023/1542",
  "Art. 49(2) · supplier names and quantities",
  "Art. 52(2) · business confidentiality",
];
const RAIL_RIGHT = "Battery passport mandatory 18 Feb 2027";

export function Hero() {
  return (
    <section className="bg-ground text-ink">
      <HeroScene className="flex min-h-[100svh] flex-col">
        <div className="relative z-10">
          <SiteHeader />
        </div>

        {/* Copy sits a little above the vertical centre of the free space, as in the refs. */}
        <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 flex-col justify-center px-[clamp(24px,4.5vw,64px)] pb-[14vh] pt-6 max-md:justify-start max-md:px-[22px] max-md:pb-6 max-md:pt-8">
          <div className="max-w-[640px]">
            <h1 className="reveal reveal-delay-1 font-display text-display-1 font-extrabold leading-[0.98] tracking-[-0.015em] text-ink">
              Prove the threshold.
              <br />
              <em className="font-bold">Keep the recipe.</em>
            </h1>
            <p className="reveal reveal-delay-2 mt-5 max-w-[480px] font-body text-lead leading-normal text-ink">
              One verdict a notified body can check: the recycled-content minimum is met. Suppliers,
              quantities and prices never leave your device.
            </p>
            <div className="reveal reveal-delay-3 mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href="#memo"
                className="inline-flex h-11 items-center rounded-[4px] bg-ink px-5 font-body text-control font-medium text-ground"
              >
                Read the technical memo
              </a>
              <a
                href="#how"
                className="font-body text-control font-medium text-ink hover:text-accent-text"
              >
                See how it works →
              </a>
            </div>
            <p className="reveal reveal-delay-3 mt-5 flex items-center gap-2 font-body text-caption text-ink-muted hero-verdict">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ok" />
              <span className="font-medium text-ok">Compliant</span>
              <span>· suppliers and quantities not disclosed</span>
            </p>
          </div>

          <PassportSlot className="mt-auto pt-8" />
        </div>

        <footer className="relative z-10 mx-auto flex min-h-14 w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[clamp(24px,4.5vw,64px)] py-3 font-body text-caption text-ink-muted tabular-nums max-md:px-[22px]">
          <ul className="flex min-w-0 items-center gap-3">
            {RAIL.map((item, i) => (
              <li
                key={item}
                className={`flex items-center gap-3 ${i === 1 ? "max-md:hidden" : ""} ${i === 2 ? "max-[1400px]:hidden" : ""}`}
              >
                {i > 0 && <span aria-hidden="true">·</span>}
                <span className="whitespace-nowrap">{item}</span>
              </li>
            ))}
          </ul>
          <span className="shrink-0 whitespace-nowrap font-medium text-ink max-lg:hidden">
            {RAIL_RIGHT}
          </span>
        </footer>
      </HeroScene>
    </section>
  );
}
