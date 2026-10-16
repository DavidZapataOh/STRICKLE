import type { ReactNode } from "react";

export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <section className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}
