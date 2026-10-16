// usage: node --env-file=/Users/david/tameion/.env apps/app/scripts/activity-live-fund.mjs <vault> [amount]
// Sends testnet USDC from the shared gas-station wallet to a proof vault so the agent's deposit poll splits it and the salary box holds the month's salary.
import { getAddress } from "viem";
import { networks, walletsClient } from "@strickle/arc";

const vault = getAddress(process.argv[2] ?? "");
const amount = process.argv[3] ?? "2";
const network = networks.testnet;
const circle = walletsClient("testnet");
const wallet = (await circle.getWallet({ id: process.env.CIRCLE_GAS_STATION_SCA_WALLET_ID })).data?.wallet?.address;
const sent = await circle.createTransaction({ blockchain: network.circleBlockchain, walletAddress: wallet, destinationAddress: vault, tokenAddress: network.usdc, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } } });
console.log(`transfer ${sent.data?.id} created: ${amount} USDC to ${vault}`);
