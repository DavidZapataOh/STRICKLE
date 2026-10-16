import { sealEnvelope } from "@strickle/pool/crypto/envelope";
import { ViewKeyRing } from "@strickle/pool/crypto/keyring";
import { generateViewKey, keyId } from "@strickle/pool/crypto/keys";
import { FREE_POLICY, policyHash } from "@strickle/pool/policy";
import type { Note } from "@strickle/pool/note";
import { bytesToHex, encodeAbiParameters, encodeEventTopics, hexToBytes, parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { readAccountantNotes } from "../src/accountant/notes.ts";
import type { RawLog } from "../src/chain/logs.ts";

const abi = parseAbi(["event NotesInserted(uint32 indexed index, uint256 commitment0, uint256 commitment1, bytes ciphertext)"]);
const note = (amount: bigint, box: Note["box"]): Note => ({ amount, ownerPk: 7n, policy: policyHash(FREE_POLICY), label: 1n, box, asset: "USDC", flags: 0, lockUntil: 0n, delayFloor: 0, salt: 5n });

const owner = generateViewKey();
const accountant = generateViewKey();
const authority = generateViewKey();
const stranger = generateViewKey();
const ring = new ViewKeyRing(owner);
ring.setAccountant(accountant.publicKey);
ring.setAuthority(authority.publicKey);

const log = (index: number, envelope: Hex, commitments: [bigint, bigint] = [11n, 0n]): RawLog => {
  const topics = encodeEventTopics({ abi, eventName: "NotesInserted", args: { index } }) as Hex[];
  const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }], [commitments[0], commitments[1], envelope]);
  return { blockNumber: BigInt(100 + index), logIndex: 0, timestamp: 1_800_000_000 + index, transactionHash: `0x${"ab".repeat(32)}`, topics, data };
};
const sealed = (value: Note) => sealEnvelope([{ note: value, policy: FREE_POLICY, viewers: ring.viewers() }, null]);

describe("readAccountantNotes", () => {
  it("opens the accountant's section and shows exactly the six fields of that tier", () => {
    const logs = [log(0, sealed(note(1_000_000n, "payroll"))), log(2, sealed(note(250_000n, "operating")))];
    const notes = readAccountantNotes(logs, accountant);
    expect(notes.map((entry) => [entry.leaf, entry.output, entry.view.amount, entry.view.box, entry.view.asset])).toEqual([[0, 0, 1_000_000n, "payroll", "USDC"], [2, 0, 250_000n, "operating", "USDC"]]);
    expect(Object.keys(notes[0]!.view).sort()).toEqual(["amount", "asset", "box", "flags", "label", "lockUntil"]);
  });

  it("shows nothing to a key that was not sealed for: a stranger, the authority and the owner's own key", () => {
    const logs = [log(0, sealed(note(1_000_000n, "payroll")))];
    for (const key of [stranger, authority, owner]) expect(readAccountantNotes(logs, key)).toEqual([]);
  });

  it("stops seeing notes sealed after the accountant was revoked, and keeps the ones sealed before", () => {
    const before = sealed(note(1n, "profit"));
    const revoking = new ViewKeyRing(owner);
    revoking.setAccountant(accountant.publicKey);
    revoking.revokeAccountant();
    const after = sealEnvelope([{ note: note(2n, "profit"), policy: FREE_POLICY, viewers: revoking.viewers() }, null]);
    expect(readAccountantNotes([log(0, before), log(2, after)], accountant).map((entry) => entry.view.amount)).toEqual([1n]);
  });

  it("skips a corrupted or truncated ciphertext instead of throwing", () => {
    const good = sealed(note(5n, "salary"));
    const truncated = good.slice(0, 40) as Hex;
    // a byte inside the accountant's own section (tier code 2, then the key's short id, then its wrapped content key)
    const bytes = hexToBytes(good);
    const marker = [2, ...keyId(accountant.publicKey)];
    const at = bytes.findIndex((_, i) => i >= 34 && marker.every((byte, j) => bytes[i + j] === byte));
    expect(at).toBeGreaterThan(0);
    bytes[at + marker.length + 5] ^= 0xff;
    const flipped = bytesToHex(bytes);
    const notes = readAccountantNotes([log(0, truncated), log(2, flipped), log(4, good)], accountant);
    expect(notes.map((entry) => entry.leaf)).toEqual([4]);
  });

  it("ignores logs that are not the pool's event", () => {
    const other = { ...log(0, sealed(note(1n, "payroll"))), topics: [`0x${"11".repeat(32)}`] as Hex[] };
    expect(readAccountantNotes([other], accountant)).toEqual([]);
  });
});
