import type { Asset } from "@strickle/core";
import type { InputMap } from "@noir-lang/noir_js";
import { ALLOWLIST_DEPTH, ASSET_ID, ASSOCIATION_DEPTH, DOMAIN, TEMPLATE_DEPTH, TREE_DEPTH, boxId } from "./constants.ts";
import { deliveryKey, deliverySalt, encryptDelivery, packDelivery } from "./delivery.ts";
import { randomField, toHex32 } from "./field.ts";
import { authHash, nullifierKey } from "./keys.ts";
import type { MerkleTree } from "./merkle.ts";
import { type Note, noteCommitment, noteNullifier } from "./note.ts";
import { hash } from "./poseidon.ts";
import type { Policy } from "./policy.ts";

export interface InputSpec {
  note: Note;
  policy: Policy;
  leafIndex: number;
}

export interface OutputSpec {
  note: Note;
  template?: { tree: MerkleTree; index: number };
}

export type Signer = { kind: "user"; sk: bigint } | { kind: "agent"; ak: bigint; nk: bigint; authHash: bigint };

export interface SpendSpec {
  tree: MerkleTree;
  inputs: [InputSpec | null, InputSpec | null];
  outputs: [OutputSpec, OutputSpec];
  signer: Signer;
  publicAmount?: bigint;
  recipient?: bigint;
  asset?: Asset;
  now?: bigint;
  ciphertextHash?: bigint;
  allowlist?: { tree: MerkleTree; index: number };
  association?: { tree: MerkleTree; index: number };
  /** Both default to fresh random values: a dummy input reused across transactions would repeat its nullifier. */
  dummyNk?: [bigint, bigint];
  dummySalt?: [bigint, bigint];
}

const ZERO_POLICY: Policy = {
  floor: 0n,
  allowlistRoot: 0n,
  restricted: false,
  agentKeyHash: 0n,
  agentCap: 0n,
  agentActions: 0,
  releaseDelay: 0,
  templateRoot: 0n,
};

export function noteToInputs(note: Note): Record<string, string | number> {
  return {
    amount: note.amount.toString(),
    owner_pk: toHex32(note.ownerPk),
    policy: toHex32(note.policy),
    label: toHex32(note.label),
    box_id: boxId(note.box),
    asset: ASSET_ID[note.asset],
    flags: note.flags,
    lock_until: note.lockUntil.toString(),
    salt: toHex32(note.salt),
  };
}

function policyToInputs(policy: Policy): Record<string, string | number> {
  return {
    floor: policy.floor.toString(),
    allowlist_root: toHex32(policy.allowlistRoot),
    restricted: policy.restricted ? 1 : 0,
    agent_key_hash: toHex32(policy.agentKeyHash),
    agent_cap: policy.agentCap.toString(),
    agent_actions: policy.agentActions,
    release_delay: policy.releaseDelay,
    template_root: toHex32(policy.templateRoot),
  };
}

const zeros = (length: number): bigint[] => Array.from({ length }, () => 0n);

export function recipientLeaf(recipient: bigint): bigint {
  return hash([DOMAIN.RECIPIENT, recipient]);
}

export function buildShieldInputs(args: { note: Note; label?: bigint }): { inputs: InputMap; publicInputs: bigint[] } {
  const label = args.label ?? args.note.label;
  const commitment = noteCommitment(args.note);
  return {
    inputs: {
      commitment: toHex32(commitment),
      amount: args.note.amount.toString(),
      asset: ASSET_ID[args.note.asset],
      label: toHex32(label),
      note: noteToInputs(args.note),
    },
    publicInputs: [commitment, args.note.amount, BigInt(ASSET_ID[args.note.asset]), label],
  };
}

export function withDummies(spec: SpendSpec): SpendSpec {
  return {
    ...spec,
    dummyNk: spec.dummyNk ?? [randomField(), randomField()],
    dummySalt: spec.dummySalt ?? [randomField(), randomField()],
  };
}

function signerKeys(signer: Signer): { nk: bigint; auth: bigint; secret: bigint } {
  return signer.kind === "user"
    ? { nk: nullifierKey(signer.sk), auth: authHash(signer.sk), secret: signer.sk }
    : { nk: signer.nk, auth: signer.authHash, secret: signer.ak };
}

function inputSlots(spec: SpendSpec & { dummyNk: [bigint, bigint]; dummySalt: [bigint, bigint] }) {
  const asset = spec.asset ?? "USDC";
  const real = spec.inputs.find((input) => input !== null);
  const { nk } = signerKeys(spec.signer);
  return spec.inputs.map((input, slot) => {
    if (input) {
      const commitment = noteCommitment(input.note);
      return {
        nullifier: noteNullifier(nk, commitment, input.leafIndex),
        circuit: {
          note: noteToInputs(input.note),
          policy: policyToInputs(input.policy),
          leaf_index: input.leafIndex.toString(),
          path: spec.tree.path(input.leafIndex).map(toHex32),
          dummy: false,
        },
      };
    }
    const dummyNote: Note = {
      amount: 0n,
      ownerPk: 0n,
      policy: 0n,
      label: 0n,
      box: real?.note.box ?? "operating",
      asset,
      flags: 0,
      lockUntil: 0n,
      salt: spec.dummySalt[slot] ?? 0n,
    };
    return {
      nullifier: noteNullifier(spec.dummyNk[slot] ?? 0n, noteCommitment(dummyNote), 0),
      circuit: {
        note: noteToInputs(dummyNote),
        policy: policyToInputs(ZERO_POLICY),
        leaf_index: "0",
        path: zeros(TREE_DEPTH).map(toHex32),
        dummy: true,
      },
    };
  });
}

function finalOutputs(spec: SpendSpec, nullifier0: bigint) {
  const real = spec.inputs.find((input) => input !== null);
  const { nk } = signerKeys(spec.signer);
  return spec.outputs.map((output, j) => {
    const isSelf = output.note.amount > 0n && real !== undefined && output.note.ownerPk === real.note.ownerPk;
    if (!isSelf) return { output, note: output.note, enc: 0n };
    const key = deliveryKey(nk, nullifier0, j);
    const note: Note = { ...output.note, salt: deliverySalt(key) };
    return { output, note, enc: encryptDelivery(packDelivery(note), key) };
  });
}

/** The notes a spend will actually commit and their delivery values; call `withDummies` first so the answer is stable. */
export function deriveOutputNotes(spec: SpendSpec): { notes: Note[]; enc: bigint[]; nullifiers: bigint[] } {
  if (!spec.dummyNk || !spec.dummySalt) throw new Error("call withDummies(spec) first");
  const nullifiers = inputSlots(spec as SpendSpec & { dummyNk: [bigint, bigint]; dummySalt: [bigint, bigint] }).map((slot) => slot.nullifier);
  const finals = finalOutputs(spec, nullifiers[0] as bigint);
  return { notes: finals.map((final) => final.note), enc: finals.map((final) => final.enc), nullifiers };
}

export function buildSpendInputs(input: SpendSpec): { inputs: InputMap; publicInputs: bigint[]; outputNotes: Note[] } {
  const spec = withDummies(input) as SpendSpec & { dummyNk: [bigint, bigint]; dummySalt: [bigint, bigint] };
  const asset = spec.asset ?? "USDC";
  const now = spec.now ?? 1_800_000_000n;
  const publicAmount = spec.publicAmount ?? 0n;
  const recipient = spec.recipient ?? 0n;
  const ciphertextHash = spec.ciphertextHash ?? 0n;
  const dummyNk = spec.dummyNk;
  const { nk: signerNk, auth: signerAuth, secret } = signerKeys(spec.signer);
  const signer = spec.signer;

  const inputNotes = inputSlots(spec);
  const nullifiers = inputNotes.map((slot) => slot.nullifier);
  const finals = finalOutputs(spec, nullifiers[0] as bigint);
  const outputs = finals.map(({ output, note }) => ({
    commitment: noteCommitment(note),
    circuit: {
      note: noteToInputs(note),
      template_index: (output.template?.index ?? 0).toString(),
      template_path: (output.template ? output.template.tree.path(output.template.index) : zeros(TEMPLATE_DEPTH)).map(toHex32),
    },
  }));
  const enc = finals.map((final) => final.enc);

  const allowlistPath = spec.allowlist ? spec.allowlist.tree.path(spec.allowlist.index) : zeros(ALLOWLIST_DEPTH);
  const associationPath = spec.association ? spec.association.tree.path(spec.association.index) : zeros(ASSOCIATION_DEPTH);
  const commitments = outputs.map((output) => output.commitment);
  const associationRoot = spec.association ? spec.association.tree.root : 0n;

  return {
    inputs: {
      root: toHex32(spec.tree.root),
      nullifiers: nullifiers.map(toHex32),
      commitments: commitments.map(toHex32),
      public_amount: publicAmount.toString(),
      recipient: toHex32(recipient),
      asset: ASSET_ID[asset],
      now: now.toString(),
      ciphertext_hash: toHex32(ciphertextHash),
      association_root: toHex32(associationRoot),
      enc: enc.map(toHex32),
      inputs: inputNotes.map((input) => input.circuit),
      outputs: outputs.map((output) => output.circuit),
      signer_kind: signer.kind === "user" ? 0 : 1,
      secret: toHex32(secret),
      owner_auth_hash: toHex32(signerAuth),
      owner_nk: toHex32(signerNk),
      dummy_nk: dummyNk.map(toHex32),
      allowlist_index: (spec.allowlist?.index ?? 0).toString(),
      allowlist_path: allowlistPath.map(toHex32),
      association_index: (spec.association?.index ?? 0).toString(),
      association_path: associationPath.map(toHex32),
    },
    publicInputs: [spec.tree.root, ...nullifiers, ...commitments, publicAmount, recipient, BigInt(ASSET_ID[asset]), now, ciphertextHash, associationRoot, ...enc],
    outputNotes: finals.map((final) => final.note),
  };
}
