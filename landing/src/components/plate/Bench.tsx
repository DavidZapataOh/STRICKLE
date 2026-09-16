import { existsSync } from "node:fs";
import { join } from "node:path";
import { Console } from "@/components/sections/Console";
import { PassportPhone } from "@/components/sections/PassportPhone";
import { RegulatorPortal } from "@/components/sections/RegulatorPortal";
import { bench as c } from "@/content/landing";
import { Engraved, Plate } from "./Plate";

/** The dark passage: three real screens on the assayer's bench. */
export function Bench() {
  const night = existsSync(join(process.cwd(), "public", "media", "square-night.jpg"));
  return (
    <Plate id={c.id} tone="dark" className="overflow-hidden" inner="py-[clamp(72px,10vw,128px)]">
      {night && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[-50vw] inset-y-0 opacity-55"
          style={{
            backgroundImage: "url(/media/square-night.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "68% 50%",
            maskImage:
              "linear-gradient(180deg, transparent 0%, black 22%, black 78%, transparent 100%)",
          }}
        />
      )}
      <div className="relative">
        <Engraved size="lg">{c.title}</Engraved>
        <div className="mt-[clamp(36px,5vw,64px)] grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-[1.15fr_0.9fr_1fr] xl:gap-8">
          <Console />
          <div className="md:order-3 xl:order-none">
            <PassportPhone />
          </div>
          <RegulatorPortal />
        </div>
        <p className="mt-8 max-w-[70ch] font-body text-caption leading-relaxed text-steel-300">
          {c.disclosure}
        </p>
      </div>
    </Plate>
  );
}
