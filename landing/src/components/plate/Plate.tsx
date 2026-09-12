import { Strike } from "@/components/reveal/Strike";

type Tone = "steel" | "brass" | "dark";

const TONE: Record<Tone, string> = {
  steel: "plate",
  brass: "plate plate-brass",
  dark: "plate plate-dark",
};

/** One sheet of the plate. Sections are seams, not boxes. */
export function Plate({
  id,
  tone = "steel",
  className = "",
  inner = "",
  children,
}: {
  id: string;
  tone?: Tone;
  className?: string;
  inner?: string;
  children: React.ReactNode;
}) {
  return (
    <Strike as="section" id={id} threshold={0.18} className={`${TONE[tone]} scroll-mt-[68px] ${className}`}>
      <div className={`relative mx-auto w-full max-w-[1440px] px-[clamp(24px,4.5vw,64px)] max-md:px-[22px] ${inner}`}>{children}</div>
    </Strike>
  );
}

/** Section heading: engraved slab, no eyebrow. Size carries the hierarchy. */
export function Engraved({
  as: Tag = "h2",
  children,
  className = "",
  size = "lg",
}: {
  as?: "h2" | "h3" | "p";
  children: React.ReactNode;
  className?: string;
  size?: "xl" | "lg" | "md";
}) {
  const sizes = {
    xl: "text-[clamp(44px,9vw,64px)] md:text-[clamp(56px,5.6vw,88px)]",
    lg: "text-[clamp(34px,7.5vw,48px)] md:text-[clamp(40px,3.8vw,60px)]",
    md: "text-[clamp(22px,4.5vw,28px)] md:text-[clamp(24px,2.1vw,32px)]",
  };
  return (
    <Tag className={`font-display font-extrabold leading-[0.98] tracking-[-0.02em] [text-wrap:balance] ${sizes[size]} ${className}`}>
      <span className="strike-h engraved">{children}</span>
    </Tag>
  );
}
