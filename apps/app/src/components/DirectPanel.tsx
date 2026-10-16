"use client";

import { useState } from "react";
import { fill } from "@/i18n/fill";
import type { DepositText } from "@/i18n/slices";
import { Card } from "@/ui/Card";

/** The other way in: USDC sent on Arc straight to the vault. A copy button that says honestly when the browser refuses. */
export function DirectPanel({ t, vault }: { t: DepositText; vault: string }) {
  const d = t.deposit.direct;
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(vault);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <Card as="section" aria-labelledby="deposit-direct">
      <h2 id="deposit-direct">{d.title}</h2>
      <p>{fill(d.body, { address: vault })}</p>
      <p className="note">{d.warning}</p>
      <button type="button" className="btn" data-variant="quiet" onClick={() => void copy()}>
        {d.copy}
      </button>
      <p role="status" aria-live="polite">
        {copied === "copied" ? d.copied : copied === "failed" ? d.copyFailed : ""}
      </p>
    </Card>
  );
}
