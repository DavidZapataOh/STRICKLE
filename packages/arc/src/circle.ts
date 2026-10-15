import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { ArcNetworkName } from "./networks.ts";

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function circleCredentials(name: ArcNetworkName, env: Record<string, string | undefined> = process.env) {
  const suffix = name.toUpperCase();
  return {
    apiKey: required(env, `CIRCLE_API_KEY_${suffix}`),
    entitySecret: required(env, `CIRCLE_ENTITY_SECRET_${suffix}`),
  };
}

export function walletsClient(name: ArcNetworkName, env: Record<string, string | undefined> = process.env) {
  return initiateDeveloperControlledWalletsClient(circleCredentials(name, env));
}
