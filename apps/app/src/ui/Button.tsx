import type { ReactNode } from "react";

export function Button({ children, href, variant = "primary", type = "button", disabled }: { children: ReactNode; href?: string; variant?: "primary" | "quiet"; type?: "button" | "submit"; disabled?: boolean }) {
  if (href && !disabled) {
    return (
      <a className="btn" data-variant={variant} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button className="btn" data-variant={variant} type={type} disabled={disabled}>
      {children}
    </button>
  );
}
