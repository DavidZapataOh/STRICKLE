import type { Asset, BoxKind } from "@strickle/core";
import { ASSET_ID, assetFromId, boxFromId, boxId } from "../constants.ts";
import type { Note } from "../note.ts";
import type { Policy } from "../policy.ts";

export const OWNER_PAYLOAD = 269;
export const ACCOUNTANT_PAYLOAD = 51;
export const AUTHORITY_PAYLOAD = 41;

class Writer {
  readonly bytes: Uint8Array;
  #at = 0;
  constructor(length: number) {
    this.bytes = new Uint8Array(length);
  }
  uint(value: bigint | number, size: number): void {
    let rest = BigInt(value);
    for (let i = size - 1; i >= 0; i--) {
      this.bytes[this.#at + i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    this.#at += size;
  }
}

class Reader {
  readonly bytes: Uint8Array;
  #at = 0;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  uint(size: number): bigint {
    let value = 0n;
    for (let i = 0; i < size; i++) value = (value << 8n) | BigInt(this.bytes[this.#at + i] as number);
    this.#at += size;
    return value;
  }
}

function expectLength(bytes: Uint8Array, length: number, name: string): void {
  if (bytes.length !== length) throw new RangeError(`${name} payload must be ${length} bytes, got ${bytes.length}`);
}

export function encodeOwnerPayload({ note, policy }: { note: Note; policy: Policy }): Uint8Array {
  const w = new Writer(OWNER_PAYLOAD);
  w.uint(note.amount, 8);
  w.uint(note.ownerPk, 32);
  w.uint(note.policy, 32);
  w.uint(note.label, 32);
  w.uint(boxId(note.box), 1);
  w.uint(ASSET_ID[note.asset], 1);
  w.uint(note.flags, 1);
  w.uint(note.lockUntil, 8);
  w.uint(note.delayFloor, 4);
  w.uint(note.salt, 32);
  w.uint(policy.floor, 8);
  w.uint(policy.allowlistRoot, 32);
  w.uint(policy.restricted ? 1 : 0, 1);
  w.uint(policy.agentKeyHash, 32);
  w.uint(policy.agentCap, 8);
  w.uint(policy.agentActions, 1);
  w.uint(policy.releaseDelay, 4);
  w.uint(policy.templateRoot, 32);
  return w.bytes;
}

export function decodeOwnerPayload(bytes: Uint8Array): { note: Note; policy: Policy } {
  expectLength(bytes, OWNER_PAYLOAD, "owner");
  const r = new Reader(bytes);
  const note: Note = {
    amount: r.uint(8),
    ownerPk: r.uint(32),
    policy: r.uint(32),
    label: r.uint(32),
    box: boxFromId(Number(r.uint(1))),
    asset: assetFromId(Number(r.uint(1))),
    flags: Number(r.uint(1)),
    lockUntil: r.uint(8),
    delayFloor: Number(r.uint(4)),
    salt: r.uint(32),
  };
  const policy: Policy = {
    floor: r.uint(8),
    allowlistRoot: r.uint(32),
    restricted: r.uint(1) === 1n,
    agentKeyHash: r.uint(32),
    agentCap: r.uint(8),
    agentActions: Number(r.uint(1)),
    releaseDelay: Number(r.uint(4)),
    templateRoot: r.uint(32),
  };
  return { note, policy };
}

export interface AccountantView {
  amount: bigint;
  asset: Asset;
  box: BoxKind;
  flags: number;
  lockUntil: bigint;
  label: bigint;
}

export function encodeAccountantPayload(note: Note): Uint8Array {
  const w = new Writer(ACCOUNTANT_PAYLOAD);
  w.uint(note.amount, 8);
  w.uint(ASSET_ID[note.asset], 1);
  w.uint(boxId(note.box), 1);
  w.uint(note.flags, 1);
  w.uint(note.lockUntil, 8);
  w.uint(note.label, 32);
  return w.bytes;
}

export function decodeAccountantPayload(bytes: Uint8Array): AccountantView {
  expectLength(bytes, ACCOUNTANT_PAYLOAD, "accountant");
  const r = new Reader(bytes);
  return {
    amount: r.uint(8),
    asset: assetFromId(Number(r.uint(1))),
    box: boxFromId(Number(r.uint(1))),
    flags: Number(r.uint(1)),
    lockUntil: r.uint(8),
    label: r.uint(32),
  };
}

export interface AuthorityView {
  amount: bigint;
  asset: Asset;
  label: bigint;
}

export function encodeAuthorityPayload(note: Note): Uint8Array {
  const w = new Writer(AUTHORITY_PAYLOAD);
  w.uint(note.amount, 8);
  w.uint(ASSET_ID[note.asset], 1);
  w.uint(note.label, 32);
  return w.bytes;
}

export function decodeAuthorityPayload(bytes: Uint8Array): AuthorityView {
  expectLength(bytes, AUTHORITY_PAYLOAD, "authority");
  const r = new Reader(bytes);
  return { amount: r.uint(8), asset: assetFromId(Number(r.uint(1))), label: r.uint(32) };
}
