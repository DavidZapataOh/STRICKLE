import type { ReactNode } from "react";

export function Card({ children, as: Tag = "div", ...rest }: { children: ReactNode; as?: "section" | "article" | "div"; "aria-labelledby"?: string }) {
  return (
    <Tag className="card" {...rest}>
      {children}
    </Tag>
  );
}
