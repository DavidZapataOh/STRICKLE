import { existsSync } from "node:fs";
import { join } from "node:path";
import { surfaces as c } from "@/content/landing";
import { Console } from "./Console";
import { PassportPhone } from "./PassportPhone";
import { RegulatorPortal } from "./RegulatorPortal";
import { Section, SectionTitle } from "./Section";

/** The one dark section: the three product surfaces over the square at dusk. */
export function Surfaces() {
  const night = existsSync(join(process.cwd(), "public", "media", "square-night.jpg"));
  return (
    <Section id={c.id} dark className="surfaces">
      {night && <div aria-hidden="true" className="surfaces-bg absolute inset-0" />}
      <div aria-hidden="true" className="surfaces-veil absolute inset-0" />
      <div className="relative">
        <SectionTitle kicker={c.kicker} title={c.title} />
        <div className="mt-14 grid items-start gap-6 md:grid-cols-2 xl:grid-cols-[1.15fr_0.9fr_1fr] xl:gap-8">
          <div className="rise rise-1">
            <Console />
          </div>
          <div className="rise rise-2 md:order-3 xl:order-none">
            <PassportPhone />
          </div>
          <div className="rise rise-3">
            <RegulatorPortal />
          </div>
        </div>
      </div>
    </Section>
  );
}
