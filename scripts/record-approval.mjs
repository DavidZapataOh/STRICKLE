import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { APPROVAL_IDS } from "./mainnet-preflight.mjs";

export function recordApproval({ file, id, value, quote, now = new Date(), replace = false }) {
  if (!APPROVAL_IDS.includes(id)) throw new Error(`unknown approval ${id}`);
  if (typeof quote !== "string" || quote.trim().length < 4) throw new Error("the owner's quote must be at least four characters of their own words");
  const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  if (current[id] && !replace) throw new Error(`${id} is already recorded; pass replace to change it`);
  const entry = { approvedOn: now.toISOString().slice(0, 10), ownerQuote: quote.trim(), ...(value === undefined ? {} : { value }) };
  writeFileSync(file, `${JSON.stringify({ ...current, [id]: entry }, null, 2)}\n`, { mode: 0o600 });
}

if (import.meta.main) {
  const [id, ...flags] = process.argv.slice(2);
  if (!process.stdin.isTTY) throw new Error("an approval is recorded from a terminal, by the owner typing it");
  const value = flags.find((flag) => flag.startsWith("--value="))?.slice("--value=".length);
  const file = process.env.MAINNET_APPROVALS_FILE ?? "/Users/david/tameion/mainnet-approvals.json";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const quote = await rl.question(`Approval "${id}"${value === undefined ? "" : ` = ${value}`}. In your own words, what are you approving? `);
  rl.close();
  recordApproval({ file, id, value, quote, replace: flags.includes("--replace") });
  console.log(`recorded ${id} in ${file}`);
}
