import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toHex32 } from "../src/field.ts";
import { deliveryKey, deliveryPad, deliverySalt, encryptDelivery, packDelivery } from "../src/delivery.ts";
import { agentKeyHash, authHash, nullifierKey, ownerPk } from "../src/keys.ts";
import { MerkleTree } from "../src/merkle.ts";
import { type Note, noteCommitment, noteNullifier, packMeta } from "../src/note.ts";
import { hash } from "../src/poseidon.ts";
import { policyHash } from "../src/policy.ts";
import { buildVectors, renderNoirMerkleTests, renderNoirTests, renderSolidityZeros } from "../src/vectors.ts";

const file = new URL("../vectors/pool-vectors.json", import.meta.url);
const noirFile = new URL("../../../circuits/pool_lib/src/vectors.nr", import.meta.url);
const big = (hex: string) => BigInt(hex);

describe("generated vectors", () => {
  it("are reproducible", () => {
    expect(JSON.stringify(buildVectors())).toBe(JSON.stringify(buildVectors()));
  });

  it("cover boundaries, every box and every asset", () => {
    const { notes } = buildVectors();
    expect(new Set(notes.map((n) => n.box))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(new Set(notes.map((n) => n.asset))).toEqual(new Set([1, 2]));
    expect(notes.some((n) => n.amount === "0")).toBe(true);
    expect(notes.some((n) => n.amount === (2n ** 64n - 1n).toString())).toBe(true);
    expect(notes.some((n) => n.lockUntil === "0")).toBe(true);
    expect(notes.some((n) => n.flags === 1)).toBe(true);
    expect(notes.some((n) => big(n.label) === 0n)).toBe(true);
  });

  it("the committed JSON file is up to date", () => {
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(JSON.parse(JSON.stringify(buildVectors())));
  });

  it("the committed Noir test file is up to date", () => {
    expect(readFileSync(noirFile, "utf8")).toBe(renderNoirTests(buildVectors()));
  });

  it("recomputes every vector with the public functions", () => {
    const v = buildVectors();
    for (const h of v.hash) expect(hash(h.inputs.map(big))).toBe(big(h.out));
    for (const k of v.keys) {
      expect(ownerPk(big(k.sk))).toBe(big(k.pk));
      expect(authHash(big(k.sk))).toBe(big(k.authHash));
      expect(nullifierKey(big(k.sk))).toBe(big(k.nk));
      expect(agentKeyHash(big(k.ak))).toBe(big(k.agentKeyHash));
    }
    for (const p of v.policies) {
      expect(
        policyHash({
          floor: BigInt(p.floor),
          allowlistRoot: big(p.allowlistRoot),
          restricted: p.restricted === 1,
          agentKeyHash: big(p.agentKeyHash),
          agentCap: BigInt(p.agentCap),
          agentActions: p.agentActions,
          releaseDelay: p.releaseDelay,
          templateRoot: big(p.templateRoot),
        }),
      ).toBe(big(p.hash));
    }
    for (const n of v.notes) {
      const note: Note = {
        amount: BigInt(n.amount),
        ownerPk: big(n.ownerPk),
        policy: big(n.policy),
        label: big(n.label),
        box: ["taxes", "payroll", "salary", "operating", "emergency", "profit"][n.box - 1] as Note["box"],
        asset: n.asset === 1 ? "USDC" : "EURC",
        flags: n.flags,
        lockUntil: BigInt(n.lockUntil),
        salt: big(n.salt),
      };
      expect(packMeta(note)).toBe(big(n.meta));
      expect(noteCommitment(note)).toBe(big(n.commitment));
    }
    for (const n of v.nullifiers) expect(noteNullifier(big(n.nk), big(n.commitment), n.leafIndex)).toBe(big(n.nullifier));
    for (const d of v.delivery) {
      const key = deliveryKey(big(d.nk), big(d.nullifier0), d.index);
      expect(key).toBe(big(d.key));
      expect(deliverySalt(key)).toBe(big(d.salt));
      expect(deliveryPad(key)).toBe(big(d.pad));
      const packed = packDelivery({ amount: BigInt(d.amount), flags: d.flags, lockUntil: BigInt(d.lockUntil) });
      expect(packed).toBe(big(d.packed));
      expect(encryptDelivery(packed, key)).toBe(big(d.enc));
    }
  });
  it("includes Merkle vectors that rebuild their roots", () => {
    const { merkle } = buildVectors();
    expect(merkle.zeros).toHaveLength(25);
    expect(merkle.pairs.length).toBeGreaterThanOrEqual(70);
    const tree = new MerkleTree(24);
    merkle.pairs.forEach((pair) => {
      expect(toHex32(tree.insertPair(BigInt(pair.a), BigInt(pair.b)).root)).toBe(pair.root);
    });
    for (const path of merkle.paths) {
      expect(toHex32(MerkleTree.rootFromPath(BigInt(path.leaf), path.index, path.siblings.map(BigInt)))).toBe(path.root);
    }
    expect(merkle.small.map((s) => s.depth)).toEqual(expect.arrayContaining([10, 20]));
  });

  it("the committed Noir Merkle tests and Solidity zeros are up to date", () => {
    expect(readFileSync(new URL("../../../circuits/pool_lib/src/merkle_vectors.nr", import.meta.url), "utf8")).toBe(
      renderNoirMerkleTests(buildVectors()),
    );
    expect(readFileSync(new URL("../../../contracts/src/pool/PoolZeros.sol", import.meta.url), "utf8")).toBe(
      renderSolidityZeros(buildVectors()),
    );
  });
});
