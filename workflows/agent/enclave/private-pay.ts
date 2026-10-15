import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { type Address, type Hex, bytesToHex, hexToBytes, numberToBytes } from "viem";
import { AGENT_ACTION, ASSET_ID } from "@strickle/pool/constants";
import { sealEnvelopeWith } from "@strickle/pool/crypto/envelope";
import { FIELD_MODULUS } from "@strickle/pool/field";
import { type Note, noteCommitment } from "@strickle/pool/note";
import { addressToField, ciphertextHash } from "@strickle/pool/pool-client";
import { type LiteSpec, noteFromWire, noteToWire, policyFromWire } from "@strickle/pool/spec-wire";
import { deriveOutputNotes, withDummies } from "@strickle/pool/witness";
import type { Profile } from "./profile.ts";

const utf8 = (value: string) => new TextEncoder().encode(value);
// Every derived value is bound to the signed request's digest as well as to (vault, version): a request whose report is refused still publishes
// its envelope, proof request and delivery values, so a second request at the same version must never reuse a key or an id.
const derive = (master: Uint8Array, vault: Address, version: bigint, digest: Hex, purpose: string, length: number) =>
  hkdf(sha256, master, Uint8Array.from([...hexToBytes(vault), ...numberToBytes(version, { size: 8 }), ...hexToBytes(digest)]), utf8(`strickle/private/${purpose}`), length);
const field = (master: Uint8Array, vault: Address, version: bigint, digest: Hex, purpose: string) =>
  BigInt(bytesToHex(derive(master, vault, version, digest, purpose, 32))) % FIELD_MODULUS;

export type PrivatePlan =
  | { ok: true; spec: LiteSpec; ciphertext: Hex; expected: (bigint | undefined)[]; next: Profile }
  | { ok: false; reason: string };

export function planPrivatePay(input: { profile: Profile; master: Uint8Array; vault: Address; version: bigint; requestDigest: Hex; nowSeconds: number; request: { box: Note["box"]; to: Address; amount: bigint }; leafOf: (commitment: bigint) => number | undefined }): PrivatePlan {
  const { profile, master, vault, version, requestDigest, request } = input;
  const mode = profile.privateMode;
  if (!mode.enabled) return { ok: false, reason: "private-mode-off" };
  const index = mode.notes.findIndex((entry) => entry.note.box === request.box && entry.note.asset === "USDC");
  if (index < 0) return { ok: false, reason: "no-note" };
  const stored = mode.notes[index];
  const note = noteFromWire(stored.note);
  const policy = policyFromWire(stored.policy);
  if (request.amount <= 0n || request.amount > note.amount) return { ok: false, reason: "amount" };
  if ((policy.agentActions & AGENT_ACTION.PAY_ALLOWLISTED) === 0) return { ok: false, reason: "not-permitted" };
  if (request.amount > policy.agentCap) return { ok: false, reason: "over-cap" };
  if (!stored.allowlist.some((address) => address.toLowerCase() === request.to.toLowerCase())) return { ok: false, reason: "not-allowlisted" };
  const now = BigInt(input.nowSeconds - 5);
  if (note.lockUntil > now) return { ok: false, reason: "locked" };
  const leafIndex = stored.leafIndex ?? input.leafOf(noteCommitment(note));
  if (leafIndex === undefined) return { ok: false, reason: "leaf-unknown" };

  const change: Note = { ...note, amount: note.amount - request.amount, salt: 0n };
  const empty: Note = { amount: 0n, ownerPk: 5n, policy: 0n, label: 0n, box: "operating", asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: field(master, vault, version, requestDigest, "empty-salt") };
  const base: LiteSpec = {
    inputs: [{ note, policy, leafIndex }, null],
    outputs: [{ note: change }, { note: empty }],
    signer: { kind: "agent", ak: BigInt(mode.ak), nk: BigInt(mode.nk), authHash: BigInt(mode.authHash) },
    publicAmount: request.amount,
    recipient: addressToField(request.to),
    asset: "USDC",
    now,
    allowlist: { addresses: stored.allowlist as Address[], index: stored.allowlist.findIndex((a) => a.toLowerCase() === request.to.toLowerCase()) },
    dummyNk: [field(master, vault, version, requestDigest, "dummy-nk-0"), field(master, vault, version, requestDigest, "dummy-nk-1")],
    dummySalt: [field(master, vault, version, requestDigest, "dummy-salt-0"), field(master, vault, version, requestDigest, "dummy-salt-1")],
    enc: [0n, field(master, vault, version, requestDigest, "enc-1")],
  };
  const derived = deriveOutputNotes(withDummies(base as never));
  const viewers = mode.viewers.map((viewer) => ({ tier: viewer.tier, publicKey: hexToBytes(viewer.publicKey as Hex) }));
  const envelope = sealEnvelopeWith([{ note: derived.notes[0] as Note, policy, viewers }, null], derive(master, vault, version, requestDigest, "envelope", 64));
  const spec: LiteSpec = { ...base, ciphertextHash: ciphertextHash(envelope) };
  const [c0, c1] = [noteCommitment(derived.notes[0] as Note), noteCommitment(derived.notes[1] as Note)];

  const next: Profile = {
    ...profile,
    privateMode: {
      ...mode,
      notes: mode.notes.flatMap((entry, at) => (at !== index ? [entry] : derived.notes[0] && (derived.notes[0] as Note).amount > 0n ? [{ ...entry, note: noteToWire(derived.notes[0] as Note), leafIndex: null }] : [])),
    },
  };
  return {
    ok: true, spec, ciphertext: envelope, next,
    expected: [undefined, derived.nullifiers[0], derived.nullifiers[1], c0, c1, request.amount, addressToField(request.to), BigInt(ASSET_ID.USDC), now, ciphertextHash(envelope), 0n, derived.enc[0], derived.enc[1]],
  };
}

export function acceptSpend(plan: Extract<PrivatePlan, { ok: true }>, publicInputs: readonly bigint[]) {
  if (publicInputs.length !== plan.expected.length) return { ok: false as const };
  const matches = plan.expected.every((value, i) => value === undefined || value === publicInputs[i]);
  if (!matches) return { ok: false as const };
  const p = publicInputs;
  return { ok: true as const, inputs: { root: p[0], nullifiers: [p[1], p[2]], commitments: [p[3], p[4]], publicAmount: p[5], recipient: p[6], asset: Number(p[7]), timestamp: p[8], associationRoot: p[10], enc: [p[11], p[12]] } };
}
