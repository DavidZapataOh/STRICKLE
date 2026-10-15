import { type Asset, BOX_KINDS, type BoxKind } from "@strickle/core";

export const DOMAIN = {
  PK: 1n,
  NK: 2n,
  NOTE: 3n,
  NULLIFIER: 4n,
  POLICY: 5n,
  AGENT: 6n,
  LABEL: 7n,
  RECIPIENT: 8n,
  AUTH: 9n,
  TEMPLATE: 10n,
} as const;

export const TREE_DEPTH = 24;
export const ALLOWLIST_DEPTH = 10;
export const ASSOCIATION_DEPTH = 20;
export const TEMPLATE_DEPTH = 3;

export const ASSET_ID: Record<Asset, number> = { USDC: 1, EURC: 2 };

export const FLAG_RELEASED = 1;

export const AGENT_ACTION = { SPLIT: 1, SWEEP: 2, REDEEM: 4, PAY_ALLOWLISTED: 8 } as const;

export function boxId(box: BoxKind): number {
  return BOX_KINDS.indexOf(box) + 1;
}

export function boxFromId(id: number): BoxKind {
  const box = BOX_KINDS[id - 1];
  if (!box) throw new RangeError(`unknown box id ${id}`);
  return box;
}

export function assetFromId(id: number): Asset {
  const asset = (Object.keys(ASSET_ID) as Asset[]).find((candidate) => ASSET_ID[candidate] === id);
  if (!asset) throw new RangeError(`unknown asset id ${id}`);
  return asset;
}
