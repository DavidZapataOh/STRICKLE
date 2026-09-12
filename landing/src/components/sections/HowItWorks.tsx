import Image from "next/image";
import { how as c } from "@/content/landing";
import { Section, SectionTitle } from "./Section";
import { StepVideo } from "./StepVideo";

export function HowItWorks() {
  return (
    <Section id={c.id} className="border-t border-edge">
      <SectionTitle kicker={c.kicker} title={c.title} />

      <ol className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-4">
        {c.steps.map((s, i) => (
          <li key={s.n} className={`rise rise-${i + 1} flex flex-col`}>
            <div className="step-media relative aspect-[16/9] overflow-hidden rounded-[6px] border border-edge bg-panel">
              {s.media.kind === "video" ? (
                <StepVideo src={s.media.src} alt={s.media.alt} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <Image
                  src={s.media.src}
                  alt={s.media.alt}
                  width={768}
                  height={432}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <span className="absolute left-3 top-3 rounded-[3px] bg-panel/85 px-2 py-1 font-mono text-[11px] tabular-nums text-ink backdrop-blur">
                {s.n}
              </span>
            </div>
            <h3 className="mt-5 font-display text-[19px] font-bold leading-snug text-ink">{s.title}</h3>
            <p className="mt-2 font-body text-[15px] leading-normal text-ink-muted">{s.body}</p>
            <p className="mt-auto pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-ink">{s.visible}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
