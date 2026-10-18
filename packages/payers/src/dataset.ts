import { type Address, type Hex, getAddress, isAddress, keccak256, toHex } from "viem";
import raw from "../data/payers.json" with { type: "json" };

export type PayerCategory = "payroll" | "payment-rail" | "dao" | "grants";
export interface PayerEntry {
  chainId: number;
  address: Address;
  name: string;
  category: PayerCategory;
  source: string;
  retrieved: string;
  note?: string;
}

/** The order of the Solidity enum `Category`. */
const CATEGORIES: readonly PayerCategory[] = ["payroll", "payment-rail", "dao", "grants"];
const KEYS = new Set(["chainId", "address", "name", "category", "source", "retrieved", "note"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const label = (value: unknown, index: number) => `entry ${index}${typeof value === "object" && value && "name" in value ? ` (${String((value as { name: unknown }).name)})` : ""}`;

/** Validates the dataset and throws naming the entry that is wrong. */
export function parsePayers(input: unknown, today: Date = new Date()): PayerEntry[] {
  if (!Array.isArray(input)) throw new Error("the payer dataset must be a list");
  const seen = new Set<string>();
  return input.map((item: unknown, index) => {
    const where = label(item, index);
    if (typeof item !== "object" || item === null) throw new Error(`${where}: not an object`);
    const entry = item as Record<string, unknown>;
    for (const key of Object.keys(entry)) if (!KEYS.has(key)) throw new Error(`${where}: unknown field ${key}`);
    const { chainId, address, name, category, source, retrieved, note } = entry;
    if (!Number.isInteger(chainId) || (chainId as number) <= 0) throw new Error(`${where}: chainId must be a positive integer`);
    if (typeof address !== "string" || !isAddress(address, { strict: false })) throw new Error(`${where}: address is not an address`);
    if (getAddress(address) !== address) throw new Error(`${where}: address is not checksummed`);
    if (typeof name !== "string" || name.trim() === "") throw new Error(`${where}: name is required`);
    if (typeof category !== "string" || !CATEGORIES.includes(category as PayerCategory)) throw new Error(`${where}: unknown category`);
    if (typeof source !== "string" || !/^https:\/\/[^\s]+$/.test(source)) throw new Error(`${where}: source must be an https URL`);
    if (typeof retrieved !== "string" || !DATE.test(retrieved) || Number.isNaN(Date.parse(retrieved))) throw new Error(`${where}: retrieved must be an ISO date`);
    if (Date.parse(retrieved) > today.getTime()) throw new Error(`${where}: retrieved is in the future`);
    if (note !== undefined && (typeof note !== "string" || note.trim() === "")) throw new Error(`${where}: note must be text`);
    const key = `${chainId}:${address}`;
    if (seen.has(key)) throw new Error(`${where}: duplicate (chainId, address)`);
    seen.add(key);
    return { chainId, address, name, category, source, retrieved, ...(note === undefined ? {} : { note }) } as PayerEntry;
  });
}

export const loadPayers = (): PayerEntry[] => parsePayers(raw);

/** A deployment only ever receives the entries of its own chain: the same address on two chains may belong to different parties. */
export const payersForChain = (entries: PayerEntry[], chainId: number): PayerEntry[] => entries.filter((entry) => entry.chainId === chainId);

export const categoryId = (category: PayerCategory): number => CATEGORIES.indexOf(category);

/** keccak256 of the entry's canonical JSON (keys sorted, no whitespace): the `metadata` stored on chain. */
export function entryHash(entry: PayerEntry): Hex {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : 1))));
  return keccak256(toHex(canonical));
}
