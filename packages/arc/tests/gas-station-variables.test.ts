import { describe, expect, it } from "vitest";
import { gasStationVariable } from "../src/gas-station-variables.ts";

describe("gasStationVariable", () => {
  it("keeps the testnet names and suffixes the mainnet ones", () => {
    expect(gasStationVariable("testnet", "SCA")).toBe("CIRCLE_GAS_STATION_SCA_WALLET_ID");
    expect(gasStationVariable("testnet", "EOA")).toBe("CIRCLE_GAS_STATION_EOA_WALLET_ID");
    expect(gasStationVariable("mainnet", "SCA")).toBe("CIRCLE_GAS_STATION_SCA_WALLET_ID_MAINNET");
    expect(gasStationVariable("mainnet", "EOA")).toBe("CIRCLE_GAS_STATION_EOA_WALLET_ID_MAINNET");
  });
});
