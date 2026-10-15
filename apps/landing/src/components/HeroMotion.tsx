"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** "Pour and level" on arrival: payments heap up, the strike bar levels them, the excess spills into the boxes. */
export function HeroMotion() {
  useGSAP(() => {
    const hero = document.querySelector("[data-hero]");
    if (!hero) return;
    const q = gsap.utils.selector(hero);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const pipes = Array.from(hero.querySelectorAll<SVGPathElement>("[data-h=pipes] path"));
      pipes.forEach((p) => {
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
      });
      const tl = gsap.timeline({ defaults: { ease: "power2.out" }, delay: 0.25 });
      tl.from(q("[data-h=back]"), { autoAlpha: 0, y: -40, duration: 0.4, stagger: 0.06 }, 0)
        .from(q("[data-h=heap]"), { y: -260, rotation: (i) => [-30, 24, -12][i % 3], autoAlpha: 0, duration: 0.6, stagger: 0.12, ease: "power3.out" }, 0.05)
        .from(q("[data-h=bar]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.45 }, 0.75)
        .from(q("[data-h=spill]"), { x: -140, y: -90, rotation: -40, autoAlpha: 0, duration: 0.55, stagger: 0.09 }, 1.05)
        .from(q("[data-h=arc]"), { autoAlpha: 0, duration: 0.3, stagger: 0.05 }, 1.1)
        .to(pipes, { strokeDashoffset: 0, duration: 0.5, stagger: 0.05, ease: "power1.inOut" }, 1.2)
        .from(q("[data-h=fill]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.5, stagger: 0.06 }, 1.45)
        .from(q("[data-h=chip]"), { autoAlpha: 0, y: 14, duration: 0.4 }, 1.85);
    });
  });
  return null;
}
