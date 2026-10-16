import type { ArcNetworkName } from "@strickle/arc/networks";

export const SANDBOX = { api: "https://api-test.circle.com", widget: "https://onramp-sandbox.arc.io" } as const;
export const PRODUCTION = { api: "https://api.circle.com", widget: "https://onramp.arc.io" } as const;

export interface OnrampConfig {
  apiKey: string;
  apiBaseUrl: string;
  widgetBaseUrl: string;
  widgetOrigin: string;
  apiOrigin: string;
  referrerDomain: string;
  environment: "sandbox" | "production";
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// Circle issues keys as <ENV>_API_KEY:<keyId>:<keySecret>; the prefix says which environment they work in.
const KEY = /^(TEST|LIVE)_API_KEY:[^:\s]+:[^:\s]+$/;

export const destinationChain = (network: ArcNetworkName): "Arc_Testnet" | "Arc" => (network === "testnet" ? "Arc_Testnet" : "Arc");

/** The kit's own documentation says `destinationChain` only pre-selects a chain in the widget (it defaults to Ethereum); `assets` is what limits what the buyer can choose. */
export const assetScope = (network: ArcNetworkName) => ({ pairs: [{ token: "USDC" as const, chain: destinationChain(network) }] as [{ token: "USDC"; chain: "Arc_Testnet" | "Arc" }] });

/** The environment follows the network and nothing else can change it: a sandbox session for a mainnet vault, or a live one for a testnet vault, is the mistake this refuses to make. */
export function onrampConfig(env: Record<string, string | undefined>, network: ArcNetworkName): OnrampConfig | null {
  const apiKey = env.ONRAMP_API_KEY;
  const referrerDomain = env.ONRAMP_REFERRER_DOMAIN;
  if (!apiKey || !referrerDomain || !HOSTNAME.test(referrerDomain)) return null;
  const match = KEY.exec(apiKey);
  const environment = network === "testnet" ? "sandbox" : "production";
  if (!match || (match[1] === "TEST") !== (environment === "sandbox")) return null;
  const endpoints = environment === "sandbox" ? SANDBOX : PRODUCTION;
  return { apiKey, apiBaseUrl: endpoints.api, widgetBaseUrl: endpoints.widget, widgetOrigin: new URL(endpoints.widget).origin, apiOrigin: new URL(endpoints.api).origin, referrerDomain, environment };
}
