import { walletsClient } from "./circle.ts";
import { networks } from "./networks.ts";

const client = walletsClient("testnet");
const blockchain = networks.testnet.circleBlockchain;

const walletSet = await client.createWalletSet({ name: "Strickle gas station checks" });
const walletSetId = walletSet.data?.walletSet?.id;
if (!walletSetId) throw new Error("wallet set creation returned no id");

for (const accountType of ["SCA", "EOA"] as const) {
  const response = await client.createWallets({ walletSetId, blockchains: [blockchain], count: 1, accountType });
  const wallet = response.data?.wallets?.[0];
  if (!wallet) throw new Error(`${accountType} wallet creation returned no wallet`);
  console.log(`CIRCLE_GAS_STATION_${accountType}_WALLET_ID=${wallet.id}`);
  console.log(`# ${accountType} address: ${wallet.address}`);
}
