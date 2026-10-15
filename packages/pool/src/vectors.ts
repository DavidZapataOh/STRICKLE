import { createHash } from "node:crypto";
import { BOX_KINDS } from "@strickle/core";
import { ASSET_ID, boxId } from "./constants.ts";
import { FIELD_MODULUS, toHex32 } from "./field.ts";
import { agentKeyHash, nullifierKey, ownerPk } from "./keys.ts";
import { MerkleTree } from "./merkle.ts";
import { type Note, noteCommitment, noteNullifier, packMeta } from "./note.ts";
import { hash } from "./poseidon.ts";
import { type Policy, policyHash } from "./policy.ts";

export interface PoolVectors {
  hash: { inputs: string[]; out: string }[];
  keys: { sk: string; pk: string; nk: string; ak: string; agentKeyHash: string }[];
  policies: {
    floor: string;
    allowlistRoot: string;
    restricted: number;
    agentKeyHash: string;
    agentCap: string;
    agentActions: number;
    releaseDelay: number;
    hash: string;
  }[];
  notes: {
    amount: string;
    ownerPk: string;
    policy: string;
    label: string;
    box: number;
    asset: number;
    flags: number;
    lockUntil: string;
    salt: string;
    meta: string;
    commitment: string;
  }[];
  nullifiers: { nk: string; commitment: string; leafIndex: number; nullifier: string }[];
  merkle: {
    zeros: string[];
    pairs: { a: string; b: string; root: string }[];
    paths: { index: number; leaf: string; siblings: string[]; root: string }[];
    small: { depth: number; index: number; leaf: string; siblings: string[]; root: string }[];
  };
}

const U64_MAX = 2n ** 64n - 1n;

function randomFieldSource(seed: string): () => bigint {
  let counter = 0;
  return () => {
    const digest = createHash("sha256").update(`${seed}:${counter++}`).digest("hex");
    return BigInt(`0x${digest}`) % FIELD_MODULUS;
  };
}

export function buildVectors(): PoolVectors {
  const next = randomFieldSource("strickle-pool-vectors-v1");
  const u64 = () => next() % (U64_MAX + 1n);

  const hashVectors: PoolVectors["hash"] = [];
  for (let length = 1; length <= 8; length++) {
    const cases = [Array.from({ length }, () => next()), Array.from({ length }, (_, i) => BigInt(i)), Array.from({ length }, () => FIELD_MODULUS - 1n)];
    for (const inputs of cases) hashVectors.push({ inputs: inputs.map(toHex32), out: toHex32(hash(inputs)) });
  }

  const secrets = [0n, 1n, FIELD_MODULUS - 1n, next(), next(), next()];
  const keys = secrets.map((sk, i) => {
    const ak = i === 0 ? 0n : next();
    return { sk: toHex32(sk), pk: toHex32(ownerPk(sk)), nk: toHex32(nullifierKey(sk)), ak: toHex32(ak), agentKeyHash: toHex32(agentKeyHash(ak)) };
  });

  const policyCases: Policy[] = [
    { floor: 0n, allowlistRoot: 0n, restricted: false, agentKeyHash: 0n, agentCap: 0n, agentActions: 0, releaseDelay: 0 },
    { floor: U64_MAX, allowlistRoot: FIELD_MODULUS - 1n, restricted: true, agentKeyHash: FIELD_MODULUS - 1n, agentCap: U64_MAX, agentActions: 15, releaseDelay: 2 ** 32 - 1 },
    ...Array.from({ length: 6 }, (_, i): Policy => ({
      floor: u64(),
      allowlistRoot: next(),
      restricted: i % 2 === 0,
      agentKeyHash: next(),
      agentCap: u64(),
      agentActions: i + 1,
      releaseDelay: Number(u64() % 2n ** 32n),
    })),
  ];
  const policies = policyCases.map((p) => ({
    floor: p.floor.toString(),
    allowlistRoot: toHex32(p.allowlistRoot),
    restricted: p.restricted ? 1 : 0,
    agentKeyHash: toHex32(p.agentKeyHash),
    agentCap: p.agentCap.toString(),
    agentActions: p.agentActions,
    releaseDelay: p.releaseDelay,
    hash: toHex32(policyHash(p)),
  }));

  const noteCases: Note[] = [];
  for (let i = 0; i < 24; i++) {
    noteCases.push({
      amount: i === 0 ? 0n : i === 1 ? U64_MAX : u64() % 10n ** 12n,
      ownerPk: next(),
      policy: next(),
      label: i % 4 === 0 ? 0n : next(),
      box: BOX_KINDS[i % BOX_KINDS.length] ?? "taxes",
      asset: i % 2 === 0 ? "USDC" : "EURC",
      flags: i % 5 === 0 ? 1 : 0,
      lockUntil: i === 2 ? 0n : i === 3 ? U64_MAX : 1_800_000_000n + u64() % 100_000_000n,
      salt: next(),
    });
  }
  const notes = noteCases.map((n) => ({
    amount: n.amount.toString(),
    ownerPk: toHex32(n.ownerPk),
    policy: toHex32(n.policy),
    label: toHex32(n.label),
    box: boxId(n.box),
    asset: ASSET_ID[n.asset],
    flags: n.flags,
    lockUntil: n.lockUntil.toString(),
    salt: toHex32(n.salt),
    meta: toHex32(packMeta(n)),
    commitment: toHex32(noteCommitment(n)),
  }));

  const leafIndexes = [0, 1, 2 ** 24 - 1, 123_456];
  const nullifiers = noteCases.slice(0, 12).map((n, i) => {
    const nk = next();
    const commitment = noteCommitment(n);
    const leafIndex = leafIndexes[i % leafIndexes.length] ?? 0;
    return { nk: toHex32(nk), commitment: toHex32(commitment), leafIndex, nullifier: toHex32(noteNullifier(nk, commitment, leafIndex)) };
  });

  const tree = new MerkleTree(24);
  const pairs = Array.from({ length: 70 }, (_, i) => {
    const a = i === 3 ? 0n : next();
    const b = i === 3 ? 0n : i === 4 ? a : next();
    return { a, b, root: tree.insertPair(a, b).root };
  });
  const leafOf = (index: number) => {
    const pair = pairs[Math.floor(index / 2)];
    return (index % 2 === 0 ? pair?.a : pair?.b) ?? 0n;
  };
  const paths = [0, 1, 2, 57, 100, 139].map((index) => ({
    index,
    leaf: toHex32(leafOf(index)),
    siblings: tree.path(index).map(toHex32),
    root: toHex32(tree.root),
  }));
  const small = [
    { depth: 10, leaves: Array.from({ length: 12 }, () => next()), indexes: [0, 5, 11] },
    { depth: 20, leaves: Array.from({ length: 5 }, () => next()), indexes: [0, 4] },
  ].flatMap(({ depth, leaves, indexes }) => {
    const smallTree = new MerkleTree(depth);
    for (const value of leaves) smallTree.insert(value);
    return indexes.map((index) => ({
      depth,
      index,
      leaf: toHex32(leaves[index] ?? 0n),
      siblings: smallTree.path(index).map(toHex32),
      root: toHex32(smallTree.root),
    }));
  });
  const merkle = {
    zeros: tree.zeros.map(toHex32),
    pairs: pairs.map((p) => ({ a: toHex32(p.a), b: toHex32(p.b), root: toHex32(p.root) })),
    paths,
    small,
  };

  return { hash: hashVectors, keys, policies, notes, nullifiers, merkle };
}

export function renderNoirTests(v: PoolVectors): string {
  const lines: string[] = [
    "// GENERATED by `npm run pool:vectors` from the TypeScript implementation. Do not edit.",
    "use crate::keys::{agent_key_hash, nullifier_key, owner_pk};",
    "use crate::note::{nullifier, Note};",
    "use crate::policy::Policy;",
    "use poseidon::poseidon2::Poseidon2;",
    "",
  ];
  v.hash.forEach((h, i) => {
    lines.push("#[test]", `fn hash_vector_${i}() {`, `    let out: Field = Poseidon2::hash([${h.inputs.join(", ")}], ${h.inputs.length});`, `    assert_eq(out, ${h.out});`, "}", "");
  });
  v.keys.forEach((k, i) => {
    lines.push(
      "#[test]",
      `fn key_vector_${i}() {`,
      `    assert_eq(owner_pk(${k.sk}), ${k.pk});`,
      `    assert_eq(nullifier_key(${k.sk}), ${k.nk});`,
      `    assert_eq(agent_key_hash(${k.ak}), ${k.agentKeyHash});`,
      "}",
      "",
    );
  });
  v.policies.forEach((p, i) => {
    lines.push(
      "#[test]",
      `fn policy_vector_${i}() {`,
      `    let policy = Policy { floor: ${p.floor}, allowlist_root: ${p.allowlistRoot}, restricted: ${p.restricted}, agent_key_hash: ${p.agentKeyHash}, agent_cap: ${p.agentCap}, agent_actions: ${p.agentActions}, release_delay: ${p.releaseDelay} };`,
      `    assert_eq(policy.hash(), ${p.hash});`,
      "}",
      "",
    );
  });
  v.notes.forEach((n, i) => {
    lines.push(
      "#[test]",
      `fn note_vector_${i}() {`,
      `    let note = Note { amount: ${n.amount}, owner_pk: ${n.ownerPk}, policy: ${n.policy}, label: ${n.label}, box_id: ${n.box}, asset: ${n.asset}, flags: ${n.flags}, lock_until: ${n.lockUntil}, salt: ${n.salt} };`,
      `    assert_eq(note.meta(), ${n.meta});`,
      `    assert_eq(note.commitment(), ${n.commitment});`,
      "}",
      "",
    );
  });
  v.nullifiers.forEach((n, i) => {
    lines.push("#[test]", `fn nullifier_vector_${i}() {`, `    assert_eq(nullifier(${n.nk}, ${n.commitment}, ${n.leafIndex}), ${n.nullifier});`, "}", "");
  });
  return lines.join("\n");
}

export function renderNoirMerkleTests(v: PoolVectors): string {
  const lines: string[] = [
    "// GENERATED by `npm run pool:vectors` from the TypeScript implementation. Do not edit.",
    "use crate::merkle::compute_root;",
    "",
  ];
  const emit = (name: string, vector: { index: number; leaf: string; siblings: string[]; root: string }) => {
    lines.push(
      "#[test]",
      `fn ${name}() {`,
      `    let path = [${vector.siblings.join(", ")}];`,
      `    assert_eq(compute_root(${vector.leaf}, ${vector.index}, path), ${vector.root});`,
      "}",
      "",
    );
  };
  v.merkle.paths.forEach((p, i) => emit(`merkle_depth_24_vector_${i}`, p));
  v.merkle.small.forEach((p, i) => emit(`merkle_depth_${p.depth}_vector_${i}`, p));
  const first = v.merkle.paths[1];
  if (first) {
    lines.push(
      "#[test(should_fail)]",
      "fn merkle_wrong_index_does_not_reproduce_the_root() {",
      `    let path = [${first.siblings.join(", ")}];`,
      `    assert_eq(compute_root(${first.leaf}, ${first.index + 2}, path), ${first.root});`,
      "}",
      "",
      "#[test(should_fail)]",
      "fn merkle_index_beyond_the_depth_is_rejected() {",
      `    let path = [${first.siblings.join(", ")}];`,
      `    let _ = compute_root(${first.leaf}, ${2 ** 24}, path);`,
      "}",
      "",
    );
  }
  return lines.join("\n");
}

export function renderSolidityZeros(v: PoolVectors): string {
  const assignments = v.merkle.zeros.map((zero, i) => `        z[${i}] = ${zero};`).join("\n");
  return [
    "// SPDX-License-Identifier: MIT",
    "// GENERATED by `npm run pool:vectors` from the TypeScript implementation. Do not edit.",
    "pragma solidity ^0.8.30;",
    "",
    "/// @dev Hashes of empty subtrees: z[0] = 0 (empty leaf), z[i + 1] = poseidon2(z[i], z[i]).",
    "library PoolZeros {",
    "    function table() internal pure returns (uint256[25] memory z) {",
    assignments,
    "    }",
    "}",
    "",
  ].join("\n");
}
