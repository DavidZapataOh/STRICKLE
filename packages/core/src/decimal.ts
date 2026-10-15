import { type Asset, NATIVE_SCALE, TOKEN_DECIMALS } from "./asset.ts";
import { type Money, money } from "./money.ts";

const SCALE = 10n ** BigInt(TOKEN_DECIMALS);
const PLAIN_DECIMAL = new RegExp(`^(\\d+)(?:\\.(\\d{1,${TOKEN_DECIMALS}}))?$`);

export function parseDecimal(asset: Asset, text: string): Money {
  const match = PLAIN_DECIMAL.exec(text);
  if (!match) {
    throw new RangeError(`not a plain decimal with at most ${TOKEN_DECIMALS} fractional digits: "${text}"`);
  }
  const [, whole = "0", fraction = ""] = match;
  return money(asset, BigInt(whole) * SCALE + BigInt(fraction.padEnd(TOKEN_DECIMALS, "0")));
}

export function formatDecimal({ units }: Money): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const fraction = (abs % SCALE).toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return `${sign}${abs / SCALE}${fraction ? `.${fraction}` : ""}`;
}

export function fromNative(nativeUnits: bigint): { money: Money; dust: bigint } {
  if (nativeUnits < 0n) throw new RangeError("a native balance cannot be negative");
  return { money: money("USDC", nativeUnits / NATIVE_SCALE), dust: nativeUnits % NATIVE_SCALE };
}

export function toNative({ asset, units }: Money): bigint {
  if (asset !== "USDC") throw new TypeError(`${asset} has no native representation`);
  return units * NATIVE_SCALE;
}
