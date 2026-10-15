import type { InputMap } from "@noir-lang/noir_js";
import { ASSET_ID, boxId } from "./constants.ts";
import { toHex32 } from "./field.ts";
import { type Note, noteCommitment } from "./note.ts";

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
