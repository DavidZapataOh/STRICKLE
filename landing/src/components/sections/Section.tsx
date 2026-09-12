import { Reveal } from "@/components/reveal/Reveal";

export function Section({
  id,
  className = "",
  inner = "",
  children,
  dark = false,
}: {
  id: string;
  className?: string;
  inner?: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <Reveal
      as="section"
      id={id}
      className={`relative scroll-mt-[68px] ${dark ? "section-dark" : ""} ${className}`}
    >
      <div
        className={`mx-auto w-full max-w-[1280px] px-[clamp(24px,4vw,64px)] py-[clamp(72px,10vw,128px)] max-md:px-[22px] ${inner}`}
      >
        {children}
      </div>
    </Reveal>
  );
}

export function SectionTitle({
  kicker,
  title,
  intro,
  align = "left",
  className = "",
}: {
  kicker: string;
  title: readonly [string, string] | readonly string[];
  intro?: string;
  align?: "left" | "center";
  className?: string;
}) {
  const [a, b] = title;
  return (
    <header className={`${align === "center" ? "mx-auto text-center" : ""} max-w-[760px] ${className}`}>
      <p className="rise flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.10em] text-ink-muted">
        {align === "left" && <span aria-hidden="true" className="inline-block h-px w-7 bg-ink-muted" />}
        {kicker}
      </p>
      <h2 className="rise rise-1 mt-4 font-display text-[clamp(30px,7vw,40px)] font-extrabold leading-[1.02] tracking-[-0.015em] text-ink md:text-[clamp(36px,3.4vw,52px)]">
        {a}
        {b && (
          <>
            <br />
            <em className="font-bold">{b}</em>
          </>
        )}
      </h2>
      {intro && (
        <p className="rise rise-2 mt-5 max-w-[620px] font-body text-[16px] leading-normal text-ink md:text-[17px]">
          {intro}
        </p>
      )}
    </header>
  );
}
