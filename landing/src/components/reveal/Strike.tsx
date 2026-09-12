"use client";

import { useEffect, useRef } from "react";

/**
 * Adds `struck` once the element enters the viewport. Children styled with
 * .strike-h / .cartouche / .flap perform the strike from an already-visible
 * flat state; reduced motion is handled in CSS.
 */
export function Strike({
  as: Tag = "div",
  className = "",
  threshold = 0.3,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "header" | "li" | "article" | "ol" | "ul";
  threshold?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("struck");
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp = Tag as any;
  return (
    <Comp ref={ref} className={className} {...rest}>
      {children}
    </Comp>
  );
}
