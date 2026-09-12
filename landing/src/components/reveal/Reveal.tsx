"use client";

import { useEffect, useRef } from "react";

/**
 * Adds the `in` class once the element enters the viewport, so children with
 * `.rise` fade up (opacity + 18 px). Respects prefers-reduced-motion via CSS.
 */
export function Reveal({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "li" | "article" }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp = Tag as any;
  return (
    <Comp ref={ref} className={`reveal-group ${className}`} {...rest}>
      {children}
    </Comp>
  );
}
