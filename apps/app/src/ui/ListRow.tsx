import type { ReactNode } from "react";

export function ListRow({ icon, title, rule, trailing, href }: { icon?: ReactNode; title: ReactNode; rule?: ReactNode; trailing?: ReactNode; href?: string }) {
  const body = (
    <>
      {icon ? <span className="row-icon">{icon}</span> : null}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {rule ? <span className="row-rule">{rule}</span> : null}
      </span>
      {trailing ? <span className="row-trailing">{trailing}</span> : null}
    </>
  );
  return href ? (
    <a className="row" href={href}>
      {body}
    </a>
  ) : (
    <div className="row">{body}</div>
  );
}
