import { questions as c } from "@/content/landing";
import { Engraved, Plate } from "./Plate";

export function Questions() {
  return (
    <Plate id={c.id} inner="py-[clamp(72px,10vw,128px)]">
      <div className="grid gap-10 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16">
        <Engraved size="lg">{c.title}</Engraved>
        <div>
          {c.items.map((it, i) => (
            <details key={it.q} className="q group" name="faq" open={i === 0}>
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-5">
                <span className="engraved font-display text-[clamp(17px,1.6vw,20px)] font-bold leading-snug">{it.q}</span>
                <span aria-hidden="true" className="q-mark" />
              </summary>
              <p className="max-w-[58ch] pb-6 font-body text-[16px] leading-relaxed text-steel-600">{it.a}</p>
              <hr className="score m-0" />
            </details>
          ))}
        </div>
      </div>
    </Plate>
  );
}
