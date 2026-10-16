import type { ReactNode } from "react";

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "calyx" | "neutral" }) {
  return (
    <span className="chip" data-tone={tone}>
      {children}
    </span>
  );
}
