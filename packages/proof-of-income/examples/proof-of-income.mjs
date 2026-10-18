import { readFileSync } from "node:fs";
import { verifyDkim } from "@strickle/proof-of-income";

const email = readFileSync(new URL("./signed.eml", import.meta.url), "utf8");
const record = JSON.parse(readFileSync(new URL("./key.json", import.meta.url), "utf8"));
const result = await verifyDkim(email, async (name) => (name === record.name ? record.txt : null));
const altered = await verifyDkim(email.replace("How are you?", "How much?"), async (name) => (name === record.name ? record.txt : null));
console.log(`signed by ${result.ok ? result.domain : result.reason}, altered body: ${altered.ok ? "accepted" : altered.reason}`);
if (!result.ok || altered.ok) throw new Error("unexpected result");
console.log("ok");
