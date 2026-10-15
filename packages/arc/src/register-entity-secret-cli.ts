import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { appendSecret, assertSecretAbsent } from "./entity-secret.ts";

const name = process.argv[2];
if (name !== "testnet" && name !== "mainnet") {
  console.error("usage: npm run register-entity-secret -w @strickle/arc -- <testnet|mainnet>");
  process.exit(1);
}

const suffix = name.toUpperCase();
const apiKey = process.env[`CIRCLE_API_KEY_${suffix}`];
if (!apiKey) throw new Error(`CIRCLE_API_KEY_${suffix} is not set`);

const envFile = resolve(import.meta.dirname, "../../../../.env");
const secretKey = `CIRCLE_ENTITY_SECRET_${suffix}`;
assertSecretAbsent(envFile, secretKey);

const recoveryDir = join(homedir(), ".strickle", "recovery", name);
mkdirSync(recoveryDir, { recursive: true, mode: 0o700 });

const entitySecret = randomBytes(32).toString("hex");
await registerEntitySecretCiphertext({ apiKey, entitySecret, recoveryFileDownloadPath: recoveryDir });
appendSecret(envFile, secretKey, entitySecret);

console.log(`Entity secret registered for ${name}.`);
console.log(`Recovery file saved in ${recoveryDir}. Store it in a password manager; Circle cannot recover it for you.`);
console.log(`${secretKey} added to ${envFile}.`);
