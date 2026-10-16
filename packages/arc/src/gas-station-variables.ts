import type { ArcNetworkName } from "./networks.ts";

export function gasStationVariable(network: ArcNetworkName, accountType: "SCA" | "EOA"): string {
  return `CIRCLE_GAS_STATION_${accountType}_WALLET_ID${network === "mainnet" ? "_MAINNET" : ""}`;
}
