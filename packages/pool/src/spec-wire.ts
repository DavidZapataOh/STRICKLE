// packages/pool/src/spec-wire.ts
import type { Asset } from "@strickle/core";
import { type Address, isAddress } from "viem";
import { ALLOWLIST_DEPTH } from "./constants.ts";
import { MerkleTree } from "./merkle.ts";
import type { Note } from "./note.ts";
import type { Policy } from "./policy.ts";
import { addressToField } from "./pool-client.ts";
import { type InputSpec, type OutputSpec, type SpendSpec, recipientLeaf } from "./witness.ts";

export type LiteSpec = Omit<SpendSpec, "tree" | "signer" | "allowlist" | "association"> & {
  signer: { kind: "agent"; ak: bigint; nk: bigint; authHash: bigint };
  allowlist?: { addresses: Address[]; index: number };
};

type Wire<T> = T extends bigint ? string : T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
export type WireSpec = Wire<LiteSpec>;

const big = (value: unknown, name: string): bigint => {
  if (typeof value !== "string" || !/^[0-9]{1,80}$/.test(value)) throw new Error(`${name} is not a decimal string`);
  return BigInt(value);
};
const text = (value: bigint) => value.toString();

export const noteToWire = (n: Note) => ({ ...n, amount: text(n.amount), ownerPk: text(n.ownerPk), policy: text(n.policy), label: text(n.label), lockUntil: text(n.lockUntil), salt: text(n.salt) });
export const noteFromWire = (w: Record<string, unknown>): Note => ({
  amount: big(w.amount, "amount"), ownerPk: big(w.ownerPk, "ownerPk"), policy: big(w.policy, "policy"), label: big(w.label, "label"),
  box: w.box as Note["box"], asset: w.asset as Asset, flags: Number(w.flags), lockUntil: big(w.lockUntil, "lockUntil"), delayFloor: Number(w.delayFloor), salt: big(w.salt, "salt"),
});
export const policyToWire = (p: Policy) => ({ ...p, floor: text(p.floor), allowlistRoot: text(p.allowlistRoot), agentKeyHash: text(p.agentKeyHash), agentCap: text(p.agentCap), templateRoot: text(p.templateRoot) });
export const policyFromWire = (w: Record<string, unknown>): Policy => ({
  floor: big(w.floor, "floor"), allowlistRoot: big(w.allowlistRoot, "allowlistRoot"), restricted: w.restricted === true, agentKeyHash: big(w.agentKeyHash, "agentKeyHash"),
  agentCap: big(w.agentCap, "agentCap"), agentActions: Number(w.agentActions), releaseDelay: Number(w.releaseDelay), templateRoot: big(w.templateRoot, "templateRoot"),
});

export function specToWire(spec: LiteSpec): WireSpec {
  const input = (slot: InputSpec | null) => (slot ? { note: noteToWire(slot.note), policy: policyToWire(slot.policy), leafIndex: slot.leafIndex } : null);
  const output = (slot: OutputSpec) => ({ note: noteToWire(slot.note) });
  return {
    inputs: [input(spec.inputs[0]), input(spec.inputs[1])],
    outputs: [output(spec.outputs[0]), output(spec.outputs[1])],
    signer: { kind: "agent", ak: text(spec.signer.ak), nk: text(spec.signer.nk), authHash: text(spec.signer.authHash) },
    publicAmount: text(spec.publicAmount ?? 0n),
    recipient: text(spec.recipient ?? 0n),
    asset: spec.asset ?? "USDC",
    now: text(spec.now ?? 0n),
    ciphertextHash: text(spec.ciphertextHash ?? 0n),
    allowlist: spec.allowlist,
    dummyNk: [text(spec.dummyNk?.[0] ?? 0n), text(spec.dummyNk?.[1] ?? 0n)],
    dummySalt: [text(spec.dummySalt?.[0] ?? 0n), text(spec.dummySalt?.[1] ?? 0n)],
    enc: [text(spec.enc?.[0] ?? 0n), text(spec.enc?.[1] ?? 0n)],
  } as WireSpec;
}

// The wire shape is validated field by field below, so the loose record is only ever read through checked converters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

export function specFromWire(wire: unknown, tree: MerkleTree): SpendSpec {
  if (typeof wire !== "object" || wire === null) throw new Error("spec is not an object");
  const w = wire as Loose;
  if (w.signer?.kind !== "agent") throw new Error("only agent spends are proven from a spec");
  const input = (slot: Loose | null): InputSpec | null =>
    slot === null ? null : { note: noteFromWire(slot.note), policy: policyFromWire(slot.policy), leafIndex: Number(slot.leafIndex) };
  const addresses: unknown[] = w.allowlist?.addresses ?? [];
  if (!addresses.every((a) => typeof a === "string" && isAddress(a))) throw new Error("allowlist holds a non-address");
  let allowlist: SpendSpec["allowlist"];
  if (w.allowlist) {
    const list = new MerkleTree(ALLOWLIST_DEPTH);
    for (const a of addresses as Address[]) list.insert(recipientLeaf(addressToField(a)));
    allowlist = { tree: list, index: Number(w.allowlist.index) };
  }
  return {
    tree,
    inputs: [input(w.inputs[0]), input(w.inputs[1])],
    outputs: [{ note: noteFromWire(w.outputs[0].note) }, { note: noteFromWire(w.outputs[1].note) }],
    signer: { kind: "agent", ak: big(w.signer.ak, "ak"), nk: big(w.signer.nk, "nk"), authHash: big(w.signer.authHash, "authHash") },
    publicAmount: big(w.publicAmount, "publicAmount"),
    recipient: big(w.recipient, "recipient"),
    asset: w.asset as Asset,
    now: big(w.now, "now"),
    ciphertextHash: big(w.ciphertextHash, "ciphertextHash"),
    allowlist,
    dummyNk: [big(w.dummyNk[0], "dummyNk"), big(w.dummyNk[1], "dummyNk")],
    dummySalt: [big(w.dummySalt[0], "dummySalt"), big(w.dummySalt[1], "dummySalt")],
    enc: [big(w.enc[0], "enc"), big(w.enc[1], "enc")],
  };
}
