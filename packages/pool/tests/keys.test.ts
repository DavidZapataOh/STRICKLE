import { BOX_KINDS } from "@strickle/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ASSET_ID, DOMAIN, assetFromId, boxFromId, boxId } from "../src/constants.ts";
import { FIELD_MODULUS } from "../src/field.ts";
import { agentKeyHash, nullifierKey, ownerPk } from "../src/keys.ts";
import { hash } from "../src/poseidon.ts";

const fieldElement = fc.bigInt({ min: 0n, max: FIELD_MODULUS - 1n });

describe("constants", () => {
  it("uses unique, non-zero domain tags", () => {
    const tags = Object.values(DOMAIN);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.every((tag) => tag > 0n)).toBe(true);
  });

  it("numbers boxes 1..6 in BOX_KINDS order and assets USDC=1, EURC=2", () => {
    expect(BOX_KINDS.map(boxId)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ASSET_ID).toEqual({ USDC: 1, EURC: 2 });
    for (const kind of BOX_KINDS) expect(boxFromId(boxId(kind))).toBe(kind);
    expect(assetFromId(2)).toBe("EURC");
  });

  it("rejects unknown ids", () => {
    expect(() => boxFromId(0)).toThrow(RangeError);
    expect(() => boxFromId(7)).toThrow(RangeError);
    expect(() => assetFromId(3)).toThrow(RangeError);
  });
});

describe("keys", () => {
  it("derives each key with its own domain tag", () => {
    expect(ownerPk(5n)).toBe(hash([DOMAIN.PK, 5n]));
    expect(nullifierKey(5n)).toBe(hash([DOMAIN.NK, 5n]));
    expect(agentKeyHash(5n)).toBe(hash([DOMAIN.AGENT, 5n]));
  });

  it("never gives the same value for different roles of the same secret", () => {
    fc.assert(
      fc.property(fieldElement, (secret) => {
        const values = [ownerPk(secret), nullifierKey(secret), agentKeyHash(secret)];
        expect(new Set(values).size).toBe(3);
      }),
      { numRuns: 50 },
    );
  });

  it("rejects secrets outside the field", () => {
    expect(() => ownerPk(FIELD_MODULUS)).toThrow(RangeError);
  });
});
