import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agentKeyHash, nullifierKey, ownerPk } from "../src/keys.ts";
import { type Note, noteCommitment, noteNullifier, packMeta } from "../src/note.ts";
import { hash } from "../src/poseidon.ts";
import { policyHash } from "../src/policy.ts";
import { buildVectors, renderNoirTests } from "../src/vectors.ts";

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
  });
});
