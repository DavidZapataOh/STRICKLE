import { describe, expect, it } from "vitest";
import { onrampKey } from "./support/onramp-keys.ts";
import { PRODUCTION, SANDBOX, assetScope, destinationChain, onrampConfig } from "../src/onramp/environment.ts";

const key = onrampKey("TEST", "abc123:def456");
const env = { ONRAMP_API_KEY: key, ONRAMP_REFERRER_DOMAIN: "app.strickle.xyz" };

describe("onrampConfig", () => {
  it("is the sandbox on testnet, with the sandbox widget and API and nothing from the environment overriding them", () => {
    const config = onrampConfig({ ...env, ONRAMP_API_BASE_URL: "https://api.circle.com", NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL: "https://onramp.arc.io" }, "testnet");
    expect(config).toMatchObject({ environment: "sandbox", apiBaseUrl: SANDBOX.api, widgetBaseUrl: SANDBOX.widget, widgetOrigin: SANDBOX.widget, apiOrigin: SANDBOX.api, referrerDomain: "app.strickle.xyz" });
  });

  it("is production on mainnet", () => {
    expect(onrampConfig({ ...env, ONRAMP_API_KEY: onrampKey("LIVE", "abc123:def456") }, "mainnet")).toMatchObject({ environment: "production", apiBaseUrl: PRODUCTION.api, widgetBaseUrl: PRODUCTION.widget });
  });

  it("is off when the key or the embedding domain is missing", () => {
    expect(onrampConfig({ ONRAMP_REFERRER_DOMAIN: "app.strickle.xyz" }, "testnet")).toBeNull();
    expect(onrampConfig({ ONRAMP_API_KEY: key }, "testnet")).toBeNull();
    expect(onrampConfig({}, "testnet")).toBeNull();
  });

  it("refuses a key issued for the other environment", () => {
    expect(onrampConfig({ ...env, ONRAMP_API_KEY: onrampKey("LIVE", "abc:def") }, "testnet")).toBeNull();
    expect(onrampConfig({ ...env, ONRAMP_API_KEY: onrampKey("TEST", "abc:def") }, "mainnet")).toBeNull();
  });

  it("refuses an embedding domain that is not a bare hostname", () => {
    for (const bad of ["https://app.strickle.xyz", "app.strickle.xyz:443", "app.strickle.xyz/pay", "*.strickle.xyz", "", " app.strickle.xyz"]) {
      expect(onrampConfig({ ...env, ONRAMP_REFERRER_DOMAIN: bad }, "testnet"), bad).toBeNull();
    }
  });

  it("names the destination chain the way the widget expects", () => {
    expect(destinationChain("testnet")).toBe("Arc_Testnet");
    expect(destinationChain("mainnet")).toBe("Arc");
  });

  it("scopes the widget to USDC on Arc, because the destination chain is only a pre-selection: a buyer who picked another chain would send money to an address that is a vault on Arc only", () => {
    expect(assetScope("testnet")).toEqual({ pairs: [{ token: "USDC", chain: "Arc_Testnet" }] });
    expect(assetScope("mainnet")).toEqual({ pairs: [{ token: "USDC", chain: "Arc" }] });
  });
});
