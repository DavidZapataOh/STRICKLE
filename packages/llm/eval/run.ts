import { readFileSync } from "node:fs";
import { classify, readInvoice } from "../src/index.ts";

const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));
const candidates = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] as number;

for (const model of candidates) {
  const classifyTimes: number[] = [];
  let correct = 0;
  for (const t of golden.transactions) {
    const start = performance.now();
    const result = await classify(t, { model });
    classifyTimes.push(performance.now() - start);
    if (result.category === t.expected) correct++;
  }
  const invoiceTimes: number[] = [];
  let exact = 0;
  for (const inv of golden.invoices) {
    const start = performance.now();
    const result = await readInvoice({ text: inv.text }, { model });
    invoiceTimes.push(performance.now() - start);
    if (result.status === "ok") {
      const preview = result.invoice.preview();
      if (preview.total === inv.expected.total && preview.dueDate === inv.expected.dueDate && preview.currency === inv.expected.currency) exact++;
    }
  }
  const c = classifyTimes.sort((a, b) => a - b);
  const i = invoiceTimes.sort((a, b) => a - b);
  console.log(JSON.stringify({ model, classification: `${correct}/${golden.transactions.length}`, classifyP50ms: Math.round(percentile(c, 0.5)), classifyP95ms: Math.round(percentile(c, 0.95)), invoices: `${exact}/${golden.invoices.length}`, invoiceP50ms: Math.round(percentile(i, 0.5)), invoiceP95ms: Math.round(percentile(i, 0.95)) }));
}
