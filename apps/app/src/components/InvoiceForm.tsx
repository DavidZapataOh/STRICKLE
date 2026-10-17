"use client";

import { useState } from "react";
import { formatUnits6 } from "@/deposit/amount";
import type { InvoicesText } from "@/i18n/slices";
import { Card } from "@/ui/Card";
import { AmountField } from "./AmountField";

export interface NewInvoiceValues {
  label: string;
  payeeName: string;
  note: string;
  amount: string;
  expiresInDays: number;
}

/** The invoice a freelancer writes: what it is for, the name the client sees, an optional note, the amount in USDC and how long the link lives. */
export function InvoiceForm({ t, busy, onCreate }: { t: InvoicesText; busy: boolean; onCreate: (values: NewInvoiceValues) => void }) {
  const f = t.invoices.form;
  const [label, setLabel] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<bigint | null>(null);
  const [days, setDays] = useState("14");
  const expiresInDays = Number(days);
  const valid = label.trim().length > 0 && payeeName.trim().length > 0 && amount !== null && Number.isInteger(expiresInDays) && expiresInDays >= 1 && expiresInDays <= 90;

  return (
    <Card as="section" aria-labelledby="invoice-form">
      <h2 id="invoice-form">{f.title}</h2>
      <form
        className="deposit"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && amount !== null) onCreate({ label: label.trim(), payeeName: payeeName.trim(), note: note.trim(), amount: formatUnits6(amount), expiresInDays });
        }}
      >
        <div className="field">
          <label htmlFor="invoice-label">{f.label}</label>
          <input id="invoice-label" maxLength={80} autoComplete="off" value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="invoice-payee">{f.payee}</label>
          <input id="invoice-payee" maxLength={60} autoComplete="off" value={payeeName} onChange={(event) => setPayeeName(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="invoice-note">{f.note}</label>
          <input id="invoice-note" maxLength={300} autoComplete="off" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <AmountField id="invoice-amount" label={f.amount} onValue={setAmount} />
        <div className="field">
          <label htmlFor="invoice-days">{f.expires}</label>
          <input id="invoice-days" inputMode="numeric" autoComplete="off" value={days} onChange={(event) => setDays(event.target.value)} />
        </div>
        <button type="submit" className="btn" disabled={!valid || busy}>
          {f.create}
        </button>
      </form>
    </Card>
  );
}
