"use client";

import { useState } from "react";
import type { ViewText } from "@/i18n/slices";

/** The account's public link in a read-only field, with a copy button that says honestly when the browser refuses. */
export function ShareLink({ href, t }: { href: string; t: Pick<ViewText, "view"> }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }
  return (
    <div className="share">
      <input className="share-field" readOnly value={href} aria-label={t.view.shareTitle} onFocus={(event) => event.currentTarget.select()} />
      <button type="button" className="btn" data-variant="quiet" onClick={() => void copy()}>
        {t.view.copy}
      </button>
      <p role="status" aria-live="polite">
        {status === "copied" ? t.view.copied : status === "failed" ? t.view.copyFailed : ""}
      </p>
    </div>
  );
}
