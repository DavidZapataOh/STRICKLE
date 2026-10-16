import { resolve } from "node:path";
import { walletsClient } from "./circle.ts";
import { appendSecret, assertSecretAbsent } from "./entity-secret.ts";
import { gasStationVariable } from "./gas-station-variables.ts";
import { networks } from "./networks.ts";

const name = process.argv[2];
if (name !== "testnet" && name !== "mainnet") {
  console.error("usage: npm run setup-gas-station-wallets -w @strickle/arc -- <testnet|mainnet>");
  process.exit(1);
}

const envFile = resolve(import.meta.dirname, "../../../../.env");
for (const accountType of ["SCA", "EOA"] as const) assertSecretAbsent(envFile, gasStationVariable(name, accountType));

const client = walletsClient(name);
const walletSet = await client.createWalletSet({ name: `Strickle gas station checks (${name})` });
const walletSetId = walletSet.data?.walletSet?.id;
if (!walletSetId) throw new Error("wallet set creation returned no id");

for (const accountType of ["SCA", "EOA"] as const) {
  const response = await client.createWallets({ walletSetId, blockchains: [networks[name].circleBlockchain], count: 1, accountType });
  const wallet = response.data?.wallets?.[0];
  if (!wallet) throw new Error(`${accountType} wallet creation returned no wallet`);
  appendSecret(envFile, gasStationVariable(name, accountType), wallet.id);
  console.log(`${gasStationVariable(name, accountType)} added to ${envFile} (address ${wallet.address})`);
}
