import { limits as c } from "@/content/landing";
import { Engraved, Plate } from "./Plate";

/** Three disclaimers, struck as statements, no cards. */
export function Limits() {
  return (
    <Plate id={c.id} inner="py-[clamp(72px,10vw,128px)]">
      <div className="grid gap-10 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16">
        <Engraved size="lg">{c.title}</Engraved>
        <ol>
          {c.items.map((it, i) => (
            <li key={it.title} className="py-7 first:pt-0 md:py-9 md:first:pt-0">
              {i > 0 && <hr className="score m-0 mb-7 md:mb-9" />}
              <Engraved as="h3" size="md">
                {it.title}
              </Engraved>
              <p className="mt-3 max-w-[58ch] font-body text-body leading-relaxed text-steel-600">
                {it.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Plate>
  );
}
