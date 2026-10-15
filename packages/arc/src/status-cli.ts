import { isAddress } from "viem";
import { networkStatus } from "./status.ts";

const address = process.argv[2];
if (!address || !isAddress(address)) {
  console.error("usage: npm run status -w @strickle/arc -- <0x address>");
  process.exit(1);
}

for (const name of ["testnet", "mainnet"] as const) {
  const status = await networkStatus(name, address);
  console.log(JSON.stringify(status, (_, value) => (typeof value === "bigint" ? value.toString() : value)));
}
